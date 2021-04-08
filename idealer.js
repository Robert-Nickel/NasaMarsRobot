'use strict';

const AWS = require("aws-sdk");
const request = require("request");


module.exports.handler = (event, context, callback) => {
    const documentClient = new AWS.DynamoDB.DocumentClient({
        region: "eu-central-1",
    });

    const fromId = '25790'
    const toId = '25607'
    persistImages(fromId, toId)

    function persistImages(fromId, toId) {
        findPrevFeaturedImageId(fromId, (prevFeaturedImageId) => {
            const image = { id: fromId, prev: prevFeaturedImageId }
            documentClient
                .put({ TableName: "mars_images", Item: image })
                .promise()
                .then(() => {
                    console.log(image.id + ' created.')
                });
            if (prevFeaturedImageId && prevFeaturedImageId != toId) {
                persistImages(prevFeaturedImageId, toId)
            }
            return callback(null, {
                statusCode: 200
            });
        })
    }
    
    function findPrevFeaturedImageId(id, prevFeaturedImageIdCallback) {
        requestPrevNext(id, (result) => {
            if (result.prev_item.featured != null) {
                prevFeaturedImageIdCallback(result.prev_item.id.toString())
            } else {
                findPrevFeaturedImageId(result.prev_item.id, prevFeaturedImageIdCallback)
            }
        })
    }
    
    function requestPrevNext(id, resultCallback) {
        request('https://mars.nasa.gov/api/v1/resources/' + id + '/prev_next/', (error, response, body) => {
            resultCallback(JSON.parse(body))
        })
    }
}