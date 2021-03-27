'use strict';

const request = require('request');
const AWS = require("aws-sdk");

module.exports.handler = (event, context, callback) => {
  const token = process.env.BOT_TOKEN;
  const BASE_URL = `https://api.telegram.org/bot${token}/`
  const NASA_RESOURCES_URL = 'https://mars.nasa.gov/resources/'
  const PREVIOUS_IMAGE = '« Older Image'
  const NEXT_IMAGE = 'Newer Image »'
  const DETAILS = 'Explanation 💡'
  const CLOSE_DETAILS = '⇡ Close Explanation ⇡'
  const SOURCE = 'View Source ℹ️'

  const documentClient = new AWS.DynamoDB.DocumentClient({
    region: "eu-central-1",
  });

  const body = JSON.parse(event.body)
  if (!body.callback_query) {
    const text = body.message.text
    const chatId = body.message.chat.id.toString()

    if (text === "/start") {
      documentClient
        .get({
          TableName: "mars_images",
          Key: {
            id: "1" // This is an index to the latest image
          }
        })
        .promise()
        .then((data) => {
          const indexToLatestImage = data.Item
          documentClient
            .get({
              TableName: "mars_images",
              Key: {
                id: indexToLatestImage.previous
              }
            })
            .promise()
            .then((data) => {
              const latestImage = data.Item
              postImage(chatId, latestImage, () => {
                documentClient
                  .put({
                    TableName: "mars_users",
                    Item: {
                      id: chatId,
                      current_image: latestImage.id
                    },
                  })
                  .promise()
                  .then(() => {
                    console.log('user created')
                    return callback(null, {
                      statusCode: 200
                    });
                  }
                  )
              })
            })
        })
    } else {
      request.post(BASE_URL + 'sendMessage', {
        form: {
          chat_id: chatId,
          text: text + ' isn\'t marsian.'
        }
      }, (error, respose, body) => {
        return callback(null, {
          statusCode: 200
        });
      });
    }
  } else {
    const callback_query_data = body.callback_query.data
    const chatId = body.callback_query.from.id.toString()
    const messageId = body.callback_query.message.message_id
    documentClient.get({
      TableName: "mars_users",
      Key: {
        id: chatId
      }
    }).promise().then((userData) => {
      let user = userData.Item
      documentClient
        .get({
          TableName: "mars_images",
          Key: {
            id: user.current_image
          }
        })
        .promise()
        .then((currentImageData) => {
          const currentImage = currentImageData.Item

          if (callback_query_data === PREVIOUS_IMAGE) {
            if (currentImage.previous) {
              documentClient
                .get({
                  TableName: "mars_images",
                  Key: {
                    id: currentImage.previous
                  }
                })
                .promise()
                .then((previousImageData) => {
                  const previousImage = previousImageData.Item
                  updateImage(chatId, messageId, previousImage, (error, response, body) => {
                    user.current_image = previousImage.id
                    documentClient.put({ TableName: "mars_users", Item: user }).promise()
                      .then(() => {
                        return callback(null, {
                          statusCode: 200
                        });
                      });
                  })
                })
            }
          } else if (callback_query_data === NEXT_IMAGE) {
            if (currentImage.next) {
              documentClient
                .get({
                  TableName: "mars_images",
                  Key: {
                    id: currentImage.next
                  }
                })
                .promise()
                .then((nextImageData) => {
                  const nextImage = nextImageData.Item
                  updateImage(chatId, messageId, nextImage, (error, response, body) => {
                    user.current_image = nextImage.id
                    documentClient.put({ TableName: "mars_users", Item: user }).promise()
                      .then(() => {
                        return callback(null, {
                          statusCode: 200
                        });
                      });
                  })
                })
            }
          } else if (callback_query_data === DETAILS) {
            request.post(BASE_URL + 'sendMessage', {
              form: {
                chat_id: chatId,
                text: currentImage.details,
                reply_markup: JSON.stringify({ inline_keyboard: [[{ text: CLOSE_DETAILS, callback_data: (CLOSE_DETAILS) }]] }),
                disable_web_page_preview: true,
                parse_mode: 'HTML'
              }
            }, (error, response, body) => {
              return callback(null, {
                statusCode: 200
              });
            })
          } else if (callback_query_data === CLOSE_DETAILS) {
            request.post(BASE_URL + 'deleteMessage', {
              form: {
                chat_id: chatId,
                message_id: messageId
              }
            }, (error, response, body) => {
              // TODO: if message > 48h will fail. Handle by telling the user to delete the message manually.
              return callback(null, {
                statusCode: 200
              });
            })
          }
        })
    })
  }

  function updateImage(chatId, imageMessageId, image, updateImageCallback) {
    request.post(BASE_URL + 'editMessageMedia', {
      form: {
        chat_id: chatId,
        message_id: imageMessageId,
        media: JSON.stringify({
          type: isImageFormat(image, 'gif') ? 'animation' : 'photo',
          media: image.telegram_id ? image.telegram_id : image.url,
          caption: getCaption(image)
        }),
        reply_markup: getImageReplyMarkup(image)
      }
    }, (error, response, body) => {
      updateImageCallback(error, response, body)
    })
  }

  function getImageReplyMarkup(image) {
    const previous = { text: PREVIOUS_IMAGE, callback_data: PREVIOUS_IMAGE }
    const next = { text: NEXT_IMAGE, callback_data: NEXT_IMAGE }
    let navigation = []
    if (image.previous) {
      navigation.push(previous)
    }
    if (image.next) {
      navigation.push(next)
    }

    return JSON.stringify({
      inline_keyboard: [
        navigation,
        [{ text: DETAILS, callback_data: DETAILS }, { text: SOURCE, url: NASA_RESOURCES_URL + image.id }]
      ]
    })
  }

  function postImage(chatId, image, postImageCallback) {
    request.post(BASE_URL + (isImageFormat(image, 'gif') ? 'sendAnimation' : 'sendPhoto'), {
      form: {
        chat_id: chatId,
        photo: image.telegram_id ? image.telegram_id : image.url,
        caption: getCaption(image),
        reply_markup: getImageReplyMarkup(image)
      }
    }, (error, response, body) => {
      addTelegramIdIfMissing(image, body)
      if (postImageCallback) {
        postImageCallback(error, response, body)
      }
    })
  }

  function addTelegramIdIfMissing(image, body) {
    if (!(image.telegram_id)) {
      const response_body = JSON.parse(body)
      if (response_body.ok) {
        image.telegram_id = isPhoto(image) ? response_body.result.photo.pop().file_id : response_body.result.document.file_id
        documentClient
          .put({ TableName: "mars_images", Item: image })
          .promise()
          .then(() => {
            console.log('added telegram_id for image ' + image.id)
          });
      }
    }
  }

  function isPhoto(image) {
    return isImageFormat(image, '.jpg') || isImageFormat(image, '.jpeg')
  }

  function isImageFormat(image, format) {
    return image.url.endsWith(format)
  }

  function getCaption(image) {
    return image.title + '\n' + image.publish_date
  }
};