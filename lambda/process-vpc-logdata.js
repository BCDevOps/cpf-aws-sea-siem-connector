const fs = require("fs");
const CSVToJSON = require("csvtojson");
const zlib = require("zlib");
const { log } = require("console");

let path = "/tmp";

// checks whether a file exists
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (err) {
    return false;
  }
}
// 1. Repackaging zip files after transformation.
// 2. Unlink temporary files.
const ziprepackage = (jsonobj, key, resolve, reject) => {
  console.log(" ziprepackage==>Conversion started");
  // log the JSON array
  console.log(typeof jsonobj);
  fs.writeFileSync(
    `${path}/temp.json`,
    JSON.stringify({
      Records: JSON.parse(JSON.stringify(jsonobj)),
    })
  );
  console.log(`ziprepackage==>json file created:${path}/temp.json`);
  // return;
  const fileContent = fs.createReadStream(`${path}/temp.json`);
  console.log(key.split(".")[0]);
  const writestream = fs.createWriteStream(`${key.split(".")[0]}.json.gz`);
  fileContent
    .pipe(zlib.createGzip())
    .pipe(writestream)
    .on("finish", (err) => {
      
      if (err) {
        console.log('ziprepackage==>error occured while repackaging to json.gz');
        reject(err);
      }

      console.log('ziprepackage==>repackaging to json.gz succesful');

      //remove temp files
      fs.unlink(`${path}/temp.csv`, () => {
        console.log("repackage==>deleted csv");
      });
      fs.unlink(`${path}/temp.json`, () => {
        console.log("repackage==>deleted json");
      });


      console.log(`ziprepackage==>reading file ${key.split(".")[0]}.json.gz`);
      fs.readFile(`${key.split(".")[0]}.json.gz`, (err, data) => {
        if (err) {
          console.log(`ziprepackage==>error occured while reading file ${key.split(".")[0]}.json.gz`);
          reject(err);
        }
      console.log(`ziprepackage==>read of  file ${key.split(".")[0]}.json.gz successful`);

        resolve(data);
        // fs.unlink(`${path}/${key.split('.')[0]}.json.gz`, () => {
        //   console.log("deleted gz");
        // });
      });
    });
};

// 1. Extracts file to temporary location
// 2. Converts the file to json
// 3. Repackages the json file
const processPayload = (filename, logdata) => {
  let source = `${path}/${filename}`;

  console.log(`source to process : ${source}`);

  fs.writeFileSync(source, logdata);

  return new Promise((resolve, reject) => {
    console.log("processpayLoad => unzip below");
    if (!fileExists(source)) {
      console.log(`processpayLoad => file ${source} does not exist`);
      return false;
    }
    try {
      // prepare streams
      var src = fs.createReadStream(source);
      var dest = fs.createWriteStream(`${path}/temp.csv`);
      // extract the archive
      src.pipe(zlib.createGunzip()).pipe(dest);
      // callback on extract completion
      dest.on("finish", () => {
        console.log(`jsonconverter==>unziped done to file: ${path}/temp.csv`);
        CSVToJSON({ delimiter: " " })
          .fromFile(`${path}/temp.csv`)
          .then((jsonobj) => {
            console.log(`jsonconverter=>json obj ${jsonobj}`);
            ziprepackage(jsonobj, source, resolve, reject);
          })
          .catch((err) => {
            // log error if any
            console.log(err);
            console.log(`jsonconverter=> Error json obj ${err}`);
            reject(err);
          });
      });
    } catch (err) {
      // either source is not readable
      // or the destination is not writable
      // or file not a gzip
      console.log(`processpayLoad => err occurred$: ${err}`);
    }
  });
};

// Prepare file to transformation for vpcflowlogs, rest unchanged.
const preparePayload = async (key, contenttype, host, logdata) => {
  console.log(`log file : : ${key.toLowerCase()}`);

  return new Promise((resolve, reject) => {
    try {
      if (key.includes("vpcflowlogs")) {
        host += `/vpcflow.logs`;
        let filename = key.split("/")[key.split("/").length - 1];
        
        //modify logdata to payload
        logdata = processPayload(filename, logdata);
        console.log(`logdata after processPayload ${logdata}`);
        contenttype = "application/json";
      } else if (key.includes("guardduty")) {
        host += `/guardduty.logs`;
      } else if (key.includes("cloudwatch")) {
        host += `/cloudwatch.logs`;
      } else if (key.includes("elbaccessLog")) {
        host += `/elb.logs`;
      } else {
        host += `/cloudtrail.logs`;
      }

      resolve({ host, contenttype, logdata });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = preparePayload;
