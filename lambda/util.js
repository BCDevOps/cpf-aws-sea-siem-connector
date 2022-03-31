// const https = require("https");

const AWS = require("aws-sdk");
const ssm = new AWS.SSM();
// const axios = require("axios");
// 1. Get Certificate from the AWS Parameter Store
// 2. Make Post request to post payload with given configuration. 
const getCert = async function () {
  console.log("Getting Certificate  from AWS SSM Parameter Store");
  return new Promise((resolve, reject) => {
    ssm.getParameter(
      {
        Name: "/secops/siem/cert",
        WithDecryption: true,
      },
      async (err, data) => {
        if (err) {
          console.log(err, err.stack);
          reject(new Error("Unable to get certificate from SSM: " + err));
        } else {

         resolve(data.Parameter.Value);
        }
      }
    );
  });
};

module.exports = getCert;
