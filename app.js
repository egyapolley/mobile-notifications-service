const http = require("http");

const {XMLParser} = require("fast-xml-parser");
const axios = require("axios");
const mysql = require("mysql2");

require("dotenv").config()

const mongoose = require("mongoose")

const Log = require("./logs")

const options = {
    attributeNamePrefix: "@_",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: true,
    ignoreNameSpace: true,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: false,
    ignoreDeclaration: true,
    removeNSPrefix: true,
    trimValues: true,
}
const parser = new XMLParser(options)

const {APP_PORT, HOSTNAME, DB_HOST, DB_USERNAME, DB_PASSWORD, DB_SCHEMA, PUSH_URL, PUSH_AUTH} = process.env

const messagesDB = {}

const messageTypesMap = {}

//const testNumbers = []


mongoose.connect("mongodb://localhost/mobileAppPUSHNotif", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
        console.log("MongoDB connected")

        const pool = mysql.createPool({
            host: DB_HOST,
            user: DB_USERNAME,
            password: DB_PASSWORD,
            database: DB_SCHEMA
        });

        pool.query("select * from Messages", (err, rows, fields) => {
            if (err) throw err
            rows.forEach(function (row) {
                messagesDB[row.id] = row.MessageBody;
            });
        })

        pool.query("select * from MobileAPPNotificationTypes", (err, rows, fields) => {
            if (err) throw err
            rows.forEach(function (row) {
                messageTypesMap[row.id] = row.name
            });
        })


        http.createServer((req, res) => {
            let alldata = ""
            req.on("data", chunk => {
                alldata += chunk
            });

            req.on("end", async () => {
                let surflineNumber=null;
                let  requestBody = null;

                try {
                    let jsonObject = parser.parse(alldata);
                    let soapBody = jsonObject.Envelope.Body.sendSMS.inputValues;

                    let to_msisdn = soapBody.phoneContact.toString();
                    let messageId = soapBody.smsId.toString();
                    let messageType = soapBody.messageType.toString()
                    surflineNumber = soapBody.callingSubscriber.toString();
                    let otherDetails = soapBody.details && soapBody.details.toString() !== 'NULL'? soapBody.details.toString():null;

                    let smsBody = messagesDB[messageId] ? messagesDB[messageId] : null;
                    let smsTitle = messageTypesMap[messageType] ? messageTypesMap[messageType] : null;

                    if (!messagesDB[messageId]) {
                        pool.query("select * from Messages where id = ?", [messageId], (err, rows) => {
                            if (err) console.log(err)

                            if (rows.length > 0) {
                                messagesDB[messageId] = rows[0].MessageBody
                                smsBody = rows[0].MessageBody
                            }


                        })
                    }
                    if (!messageTypesMap[messageType]) {
                        pool.query("select * from MobileAPPNotificationTypes where id = ?", [messageType], (err, rows) => {
                            if (err) console.log(err)

                            if (rows.length > 0) {
                                messageTypesMap[messageType] = rows[0].name
                                smsTitle = rows[0].name
                            }


                        })
                    }



                    if (!smsBody) return res.end("success")

                    smsBody = smsBody.replace("XXXXXX", surflineNumber.replace(/^233/, "0"))
                    if(messageId === '900' && otherDetails){
                        smsBody =smsBody.replace("SSSSSS", otherDetails)

                    }
/*
                    if (!testNumbers.includes(surflineNumber)) {
                        await pushSMS(smsBody, to_msisdn)
                        return res.end("success")
                    }*/

                    requestBody = {
                        msisdn: surflineNumber,
                        title: smsTitle,
                        message: smsBody,
                        contact: to_msisdn
                    }
                    const response = await axios.post(PUSH_URL, requestBody, {headers: {Authorization: PUSH_AUTH}})
                    const {status, data: responseBody} = response;

                    const log = new Log({
                        surflineNumber,
                        status,
                        requestBody: JSON.stringify(requestBody),
                        responseBody: JSON.stringify(responseBody)
                    })
                    await log.save()
                    res.end("success")


                } catch (error) {

                    const {status, data: responseBody} = error.response;
                    const log = new Log({
                        surflineNumber,
                        status,
                        requestBody: JSON.stringify(requestBody),
                        responseBody: JSON.stringify(responseBody)
                    })
                    await log.save()

                    res.end("success")

                }

            });


        }).listen(APP_PORT, HOSTNAME, () => {
            console.log(`App listening  on  http://${HOSTNAME}:${APP_PORT}`)
        })

    }
).catch(error => {
    console.log("Mongo DB  Connection Error ", error)

})


async function pushSMS(smsContent, to_msisdn) {

    const {SMS_URL, SMS_AUTH} = process.env


    let messageBody = {
        Content: smsContent,
        FlashMessage: false,
        From: "Surfline",
        To: to_msisdn,
        Type: 0,
        RegisteredDelivery: true
    };

    return axios.post(SMS_URL, messageBody, {headers: {Authorization: SMS_AUTH}})


}




