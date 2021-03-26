'use strict';

const request = require('request');
const AWS = require("aws-sdk");

module.exports.handler = (event, context, callback) => {
  const token = process.env.BOT_TOKEN;
  const BASE_URL = `https://api.telegram.org/bot${token}/`
  const NEXT = "Next"
  const FINAL = "final"
  const NASA_RESOURCES_URL = "https://mars.nasa.gov/resources/"

  const documentClient = new AWS.DynamoDB.DocumentClient({
    region: "eu-central-1",
  });

  const body = JSON.parse(event.body)
  if (typeof body.callback_query !== 'undefined') {
    const callback_query_data = body.callback_query.data
    const chatId = body.callback_query.from.id.toString()
    const message_id = body.callback_query.message.message_id
    documentClient.get({
      TableName: "mars_users",
      Key: {
        id: chatId
      }
    }).promise().then((userData) => {
      const user = userData.Item
      if (callback_query_data === NEXT) {
        if (user.next_image === FINAL) {
          postMessage(chatId, 'You reached the end of the archive. But not the end of human knowledge. Keep going: https://en.wikipedia.org/wiki/Main_Page', (error, response, body) => {
            return callback(null, {
              statusCode: 200
            });
          })
        } else {
          documentClient
            .get({
              TableName: "mars_images",
              Key: {
                id: user.next_image
              }
            })
            .promise()
            .then((imageData) => {
              const image = imageData.Item
              request.post(BASE_URL + 'editMessageMedia', {
                form: {
                  chat_id: chatId,
                  message_id: message_id,
                  media: JSON.stringify({
                    type: isImageFormat(image, 'gif') ? 'animation' : 'photo',
                    media: image.telegram_id ? image.telegram_id : image.url,
                    caption: image.title
                  }),
                  reply_markup: getReplyMarkup(image)
                }
              }, (error, response, body) => {
                user.current_image = image.id
                if (image.next) {
                  user.next_image = image.next
                } else {
                  user.next_image = FINAL
                }
                documentClient.put({ TableName: "mars_users", Item: user }).promise()
                  .then(() => {
                    return callback(null, {
                      statusCode: 200
                    });
                  });
              })
            })
        }
      }
    })
  } else {
    const text = body.message.text
    const chatId = body.message.chat.id.toString()

    if (text == "/start") {
      documentClient
        .get({
          TableName: "mars_images",
          Key: {
            id: "1" // This is an index to the latest image
          }
        })
        .promise()
        .then((data) => {
          const index = data.Item
          documentClient
            .get({
              TableName: "mars_images",
              Key: {
                id: index.next
              }
            })
            .promise()
            .then((data) => {
              const image = data.Item
              postImage(chatId, image)

              documentClient
                .put({
                  TableName: "mars_users",
                  Item: {
                    id: chatId,
                    current_image: image.id,
                    next_image: image.next
                  },
                })
                .promise()
                .then(() => console.log('user created'))
            })
        })
    } else {
      postMessage(chatId, text + ' isn\'t marsian.', (error, response, body) => { })
    }
    return callback(null, {
      statusCode: 200
    });
  }

  function postMessage(chatId, text, sendMessageCallback) {
    request.post(BASE_URL + 'sendMessage', {
      form: {
        chat_id: chatId,
        text: text,
        disable_web_page_preview: true,
        parse_mode: 'HTML'
      }
    }, (error, response, body) => {
      sendMessageCallback(error, response, body)
    });
  }

  function getReplyMarkup(image) {
    return JSON.stringify({
      inline_keyboard: [
        [{ text: 'View Source', url: NASA_RESOURCES_URL + image.id }],
        [{ text: NEXT, callback_data: NEXT }]
      ]
    })
  }

  function postImage(chatId, image, postImageCallback) {
    if (isPhoto(image)) {
      request.post(BASE_URL + 'sendPhoto', {
        form: {
          chat_id: chatId,
          photo: image.telegram_id ? image.telegram_id : image.url,
          caption: image.title,
          reply_markup: getReplyMarkup(image)
        }
      }, (error, response, body) => {
        addTelegramIdIfMissing(image, body)
        if (postImageCallback) {
          postImageCallback(error, response, body)
        }
      })
    } else if (isImageFormat(image, 'gif')) {
      request.post(BASE_URL + 'sendAnimation', {
        form: {
          chat_id: chatId,
          animation: image.telegram_id ? image.telegram_id : image.url,
          caption: image.title,
          reply_markup: getReplyMarkup(image)
        }
      }, (error, response, body) => {
        addTelegramIdIfMissing(image, body)
        if (postImageCallback) {
          postImageCallback(error, response, body)
        }
      })
    }
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
};