const aws = require("aws-sdk");
const axios = require("axios");
const https = require("https");
const s3 = new aws.S3({ apiVersion: "2006-03-01" });
const preparePayload = require("./process-vpc-logdata");

const getCert = require("./util");

// 1. Get Payload from bucket to process
// 2. Transform Payload for vpcflow.logs scenario else keep unchanged.
// 3. Post Payload to endpoint.
module.exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // Get the object from the event and show its content type
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " ")
  );
  const params = {
    Bucket: bucket,
    Key: key,
  };
  try {
    const file = await s3.getObject(params).promise();
    let host = process.env.LOG_CONSUMER_ENDPOINT;
    let contentEnc = file.ContentEncoding || "gzip";
    let contenttype = file.ContentType;
    let logdata = file.Body;
    if(logdata.length <1){
      console.log('logdata is empty,, process terminated');
      return;
    }
    console.log(`keytoLowercase: ${key.toLowerCase()}`);

    ({ host, contenttype, logdata } = await preparePayload(
      key,
      contenttype,
      host,
      logdata
    ));
    console.log(
      `filename: ${key}  -ContentEncoding:${contentEnc} -ContentType:${contenttype} - Host :${host}- logdata: ${logdata}`
    );
    var config = {
      method: "post",
      url: host,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        cert: await getCert(),
      }),
      headers: {
        "Content-Type": contenttype,
        "Content-Encoding": contentEnc,
      },
      data: await logdata,
    };

    console.log(`bfore axios with config ${JSON.stringify(config)}`);

    try {
      const response = await axios(config);
      console.log(response);
    } catch (error) {
      console.log(error);
    }

    console.log(`after axios with config`);
  } catch (err) {
    console.log(err);
    // const message = `.`;
    // console.log(message);
    throw new Error(err);
  }
};
