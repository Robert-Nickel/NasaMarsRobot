'use strict';

const AWS = require("aws-sdk");
const request = require('request');

module.exports.handler = (event, context, callback) => {
    const documentClient = new AWS.DynamoDB.DocumentClient({
        region: "eu-central-1",
    });
    const token = process.env.BOT_TOKEN;
    const BASE_URL = `https://api.telegram.org/bot${token}/`

    documentClient
        .get({
            TableName: 'mars_images',
            Key: {
                id: '1'
            }
        })
        .promise()
        .then((data) => {
            const indexToLatestImage = data.Item
            documentClient.scan({
                TableName: "mars_users"
            }, (err, data) => {
                data.Items.forEach((item) => {
                    if (item.subscribed) {
                        if (item.current_image != indexToLatestImage) {
                            request.post(BASE_URL + 'sendMessage', {
                                form: {
                                    chat_id: item.id,
                                    text: 'Received new images from Mars..'
                                }
                            }, (error, respose, body) => {
                                return callback(null, {
                                    statusCode: 200
                                });
                            });
                        }
                    } else {
                        return callback(null, {
                            statusCode: 200
                        });
                    }
                });
            })
        })
}