'use strict';

const AWS = require("aws-sdk");
const request = require("request");

module.exports.handler = (event, context, callback) => {
    const documentClient = new AWS.DynamoDB.DocumentClient({
        region: "eu-central-1",
    });

    documentClient
        .get({
            TableName: 'mars_images',
            Key: {
                id: '1'
            }
        })
        .promise()
        .then((data) => {
            const idLatestImage = data.Item.prev
            findNextFeaturedImage(idLatestImage, (nextFeaturedImageId) => {
                if (nextFeaturedImageId) {
                    documentClient.put({
                        TableName: "mars_images", Item: { id: '1', prev: nextFeaturedImageId }
                    })
                        .promise()
                        .then(() => {
                            console.log('Updated index to latest image')
                            documentClient
                                .put({
                                    TableName: "mars_images", Item:
                                    {
                                        id: nextFeaturedImageId,
                                        prev: idLatestImage
                                    }
                                })
                                .promise()
                                .then(() => {
                                    console.log('Saved new latest image: ' + nextFeaturedImageId)
                                    documentClient
                                        .get({
                                            TableName: 'mars_images',
                                            Key: {
                                                id: idLatestImage
                                            }
                                        })
                                        .promise()
                                        .then((data) => {
                                            let formerLatestImage = data.Item
                                            formerLatestImage.next = nextFeaturedImageId
                                            documentClient
                                                .put({
                                                    TableName: "mars_images", Item: formerLatestImage
                                                })
                                                .promise()
                                                .then(() => {
                                                    console.log('Updated former last image: ' + formerLatestImage.id)
                                                    // TODO: Why is this not necessary? I'm confused..
                                                    /*
                                                    const params = {
                                                        FunctionName: 'nasa-mars-robot-dev-nextidfinder',
                                                        InvocationType: 'RequestResponse',
                                                        LogType: 'Tail',
                                                        Payload: '{}'
                                                    };
                                                    lambda.invoke(params, (err, data) => {
                                                        if (err) {
                                                            context.fail(err);
                                                        } else {
                                                            context.succeed('nextidfinder worked: ' + data.Payload);
                                                        }
                                                    })*/
                                                })
                                        })
                                })
                        })
                } else {
                    return callback(null, {
                        statusCode: 200
                    });
                }
            })
        })

    return callback(null, {
        statusCode: 200
    });

    function findNextFeaturedImage(id, callback) {
        request('https://mars.nasa.gov/api/v1/resources/' + id + '/prev_next/', (error, response, body) => {
            const nextItem = JSON.parse(body).next_item
            if (nextItem.id < 30000) {
                if (nextItem.featured != null) {
                    callback(nextItem.id.toString())
                } else {
                    findNextFeaturedImage(nextItem.id, callback)
                }
            } else {
                callback(null)
            }
        })
    }
}