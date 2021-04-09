'use strict';

const AWS = require("aws-sdk");
const request = require("request");


module.exports.handler = (event, context, callback) => {
    const documentClient = new AWS.DynamoDB.DocumentClient({
        region: "eu-central-1",
    });

    const FIRST_ID = '25790'
    const LAST_ID = '25451'
    persistImages(FIRST_ID, LAST_ID, () => {
        console.log('how is this possible?')
        addNexts()
    })

    function persistImages(fromId, toId, imagesPersistedCallback) {
        findPrevFeaturedImageId(fromId, (prevFeaturedImageId) => {
            const image = { id: fromId, prev: prevFeaturedImageId }
            documentClient
                .put({ TableName: "mars_images", Item: image })
                .promise()
                .then(() => {
                    console.log(image.id + ' created.')
                    // TODO: dont deal ids I already know
                    if (prevFeaturedImageId && prevFeaturedImageId != toId) {
                        persistImages(prevFeaturedImageId, toId, imagesPersistedCallback)
                    } else {
                        imagesPersistedCallback()
                    }
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

    function addNexts() {
        documentClient
            .get({
                TableName: 'mars_images',
                Key: {
                    id: '1'
                }
            })
            .promise()
            .then((data) => {
                const indexToLatestImage = data.Item.prev
                documentClient
                    .get({
                        TableName: "mars_images",
                        Key: {
                            id: indexToLatestImage
                        }
                    })
                    .promise()
                    .then((data) => {
                        const latestImage = data.Item
                        addNextToPrevious(latestImage.id, latestImage.prev)
                    })
            })
    }

    function addNextToPrevious(nextId, prevId) {
        documentClient
            .get({
                TableName: "mars_images",
                Key: {
                    id: prevId
                }
            })
            .promise()
            .then((data) => {
                let prevImage = data.Item
                prevImage.next = nextId
                documentClient
                    .put({ TableName: "mars_images", Item: prevImage })
                    .promise()
                    .then(() => {
                        console.log('Added next: ' + nextId + ' to: ' + prevImage.id)
                        if (LAST_ID != prevImage.prev) {
                            addNextToPrevious(prevId, prevImage.prev)
                        }
                        return callback(null, {
                            statusCode: 200
                        });
                    });
            })
    }
}