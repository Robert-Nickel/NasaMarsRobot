'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const request = require('request');
const AWS = require("aws-sdk");
const { html } = require('cheerio');


module.exports.handler = (event, context, callback) => {
    const documentClient = new AWS.DynamoDB.DocumentClient({
        region: "eu-central-1",
    });
    documentClient.scan({
        TableName: "mars_images"
    }).promise().then((data) => {
        const images = data.Items
        images.forEach(image => {
            if (image.id != 1) {
                if (!image.url || !image.details || !image.title || !image.publish_date) {
                    fetchData('https://mars.nasa.gov/resources/' + image.id).then((res) => {
                        const html = res.data;
                        const $ = cheerio.load(html);
                        image.url = 'https://mars.nasa.gov' + $('#main_image')[0].attribs.src
                        image.title = $('.article_title').text()
                        image.publish_date = $('.wysiwyg_content > p').first().text()
                        // scrape the details
                        const paragraphs = $('.wysiwyg_content > p').toString().split('</p><p>')
                        paragraphs.shift() // remove the publish_date
                        let details = ''
                        paragraphs.forEach((paragraph) => {
                            details += paragraph + '\n\n'
                        })
                        details = removeHtmlTags(details, ['span', 'sup'])
                        image.details = details.split('</p>')[0] // remove the trailing </p>
                        documentClient.put({ TableName: "mars_images", Item: image }).promise()
                            .then(() => {
                                console.log('updated image ' + image.id)
                            });
                    })
                }
            }
        })
    })

    return callback(null, {
        statusCode: 200
    });

    async function fetchData(url) {
        console.log("Crawling data... at url " + url)
        // make http call to url
        let response = await axios(url).catch((err) => console.log(err));

        if (response.status !== 200) {
            console.log("Error occurred while fetching data");
            return;
        }
        return response;
    }
}

function removeHtmlTags(text, htmlTags) {
    let result = text
    htmlTags.forEach(htmlTag => {
        result = result.split('<' + htmlTag + '>').join('').split('</' + htmlTag + '>').join('')
    })
    return result
}