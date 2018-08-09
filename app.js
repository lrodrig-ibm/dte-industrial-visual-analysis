require('dotenv').config();

var express = require('express'),
    http = require('http'),
    path = require('path'),
    fs = require('fs');

var jsonfile = require( 'jsonfile' );
var request = require( 'request' );
var watson = require('watson-developer-cloud');
var fs = require('fs');
var Cloudant = require('cloudant');
var gm = require('gm').subClass({
      imageMagick: true
    });
var archiver = require('archiver');

var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var multipart = require('connect-multiparty')
var multipartMiddleware = multipart();

// Load credentials
// From IBM Cloud configuration or local file

var vcapServices = require('vcap_services');
// Cloudant Credentials
var cloudantCredentials = vcapServices.getCredentials('cloudantNoSQLDB');
var cloudant_username = cloudantCredentials.username || process.env.CLOUDANT_USERNAME;
var cloudant_pwd = cloudantCredentials.password || process.env.CLOUDANT_PASSWORD;
var cloudant_host = cloudantCredentials.host || process.env.CLOUDANT_HOST;
var cloudant_url = cloudantCredentials.url || process.env.CLOUDANT_URL;

//Visual Recognition Credentials
var vrCredentials = vcapServices.getCredentials('watson_vision_combined');
var vr_key = vrCredentials.api_key || process.env.VR_KEY;
var vr_url = vrCredentials.url || process.env.VR_URL;
var vr_classifiers = process.env.VR_CLASSIFIERS || "default";

console.log (cloudant_url);
console.log (vr_key);
console.log (vr_classifiers);

// Initialize Cloudant DB
var cloudant = Cloudant(cloudant_url);
var db;
var dbName = "image_db";

cloudant.db.create(dbName, function() {
    db = cloudant.db.use(dbName);
});

var feed = cloudant.db.follow(dbName, {since: "now"});
feed.on('change', function (body) {
    console.log("Changes in Cloudant DB detected!");
    console.log(body);
    
    var newdocpattern = /^2-.*/g;
    var cloudantDocument = {};
    cloudantDocument.args = body;
    
    var fs = require('fs');
    var request = require('request');
    
    // nothing to do on deletion or update event
    if (cloudantDocument.args.deleted) {
        console.log("Cloudant document has been deleted, no action needed");
    } else if (newdocpattern.test(cloudantDocument.args.changes[0].rev)){
        console.log("New cloudant doc detected!");
        
        var fileName;
        var thumbFileName;
        
        //get document from cloudant
        var p0 = function(cloudantDocument) {
            console.log("Getting doc from Cloudant");
            var promise = new Promise(function(resolve, reject) {
                  db.get(cloudantDocument.args.id, null, function(error, response) {
                    if (!error) {
                         console.log("Get DOC from cloudant successful " + JSON.stringify(response));
                         
                         //Adding args to cloudant document for future reference
                         response.args = cloudantDocument.args;
                         cloudantDocument = response;
                         
                         console.log("CLOUDANTDOC CONTAINS: " + JSON.stringify(cloudantDocument));
                         console.log("Entered Main Analysis Implementation");
                         
                         //sleep(2000);
                         if (cloudantDocument.hasOwnProperty("_id") &&
                             cloudantDocument.type == "image_db.image" &&
                             !cloudantDocument.hasOwnProperty("analysis") &&
                             cloudantDocument.hasOwnProperty("_attachments") &&
                             cloudantDocument._attachments.hasOwnProperty("image.jpg") &&
                             !cloudantDocument._attachments.hasOwnProperty("thumbnail.jpg")) {
                         
                             console.log("DOC EXISTS!");
                             var imageDocumentId = cloudantDocument._id;
                             console.log("[", imageDocumentId, "] Processing image.jpg from document");
                         
                             resolve(cloudantDocument);
                         } else {
                         console.log("Document did not contain correct properties, ignoring");
                         //return {status: "Document did not contain correct properties, ignoring"};
                         }
                         
                    } else {
                         console.log("Error getting document");
                         console.log(err);
                         reject(err);
                         }
                         });
                  });
            return promise;
        };
        
        var p1 = function(cloudantDocument) {
            console.log("Initial doc and args here: " + JSON.stringify(cloudantDocument));
            var promise = new Promise(function(resolve, reject) {
                  db.get(imageDocumentId, null, function(error, response) {
                         if (!error) {
                         console.log('read success', response);
                         resolve(cloudantDocument);
                         } else {
                         console.error('read error', error);
                         reject(error);
                         }
                         });
                  });
            return promise;
        };
        
        //Enrich cloudant document with Weather Data
        var p8 = function(cloudantDocument) {
            var promise = new Promise(function(resolve, reject) {
                  cloudantDocument.weather = {};
                  if (true) {
                  resolve(cloudantDocument);
                  }
                  else {
                  reject(Error("It broke"));
                  }
                  });
            return promise;
        };
        
        //Get Attachment from Cloudant
        var p2 = function(cloudantDocument) {
        console.log("After enriching data with Weather: " + JSON.stringify(cloudantDocument));
        fileName = cloudantDocument._id + "-image.jpg";
        var promise = new Promise(function(resolve, reject) {
          db.attachment.get(cloudantDocument._id, "image.jpg").pipe(fs.createWriteStream(fileName))
          .on("finish", function () {
              console.log("Completed get of attachment");
              resolve(cloudantDocument);
              })
          .on("error", function (err) {
              console.log("Error on get of attachment");
              reject(err);
              });
          });
        return promise;
        };
        
        //Process Thumbnail
        var p3 = function(cloudantDocument) {
        thumbFileName = cloudantDocument._id + "-thumbnail.jpg";
        var promise = new Promise(function(resolve, reject) {
          console.log("generating thumbnail");
          processThumbnail(cloudantDocument, fileName, thumbFileName, function (err, cloudantDocument, thumbFileName) {
               if (err) {
               console.log("Rejecting processThumbnail");
               reject(err);
               } else {
               console.log("Resolving processThumbnail" + JSON.stringify(cloudantDocument));
               resolve(cloudantDocument);
               }
               });
          });
        return promise;
        };
        
        //Process Image
        var p4 = function(cloudantDocument) {
        var promise = new Promise(function(resolve, reject) {
          console.log("processing & analyzing image")
          processImage(cloudantDocument, fileName, function (err, analysis) {
               if (err) {
               console.log("Rejecting processImage");
               reject(err);
               } else {
               console.log("Resolving processImage");
               cloudantDocument.analysis = analysis;
               //console.log("Document info: " + JSON.stringify(cloudantDocument));
               resolve(cloudantDocument);
               }
               });
          
          });
        return promise;
        };
        
        //Insert data into Cloudant
        var p5 = function(cloudantDocument) {
        var promise = new Promise(function(resolve, reject) {
              console.log("Updating document: " + cloudantDocument._id + ", rev: " + cloudantDocument._rev)
              db.insert(cloudantDocument, function (err, body, headers) {
                    if (err) {
                    console.log("Error reached in p5 while trying to update document");
                    Promise.reject(err);
                    } else {
                    //console.log("BODY AFTER UUPDATE IS: " + JSON.stringify(body));
                    //console.log("HEADERS AFTER UUPDATE IS: " + JSON.stringify(headers));
                    cloudantDocument._rev = body.rev;
                    console.log("doc after update is: " + JSON.stringify(cloudantDocument));
                    resolve(cloudantDocument);
                    }
                });
              });
        return promise;
        };
        
        //Insert attachment
        var p6 = function(cloudantDocument) {
        var promise = new Promise(function(resolve, reject) {
          console.log("saving thumbnail: " + thumbFileName + " to:");
          //console.log(JSON.stringify(cloudantDocument));
          
          fs.readFile(thumbFileName, function(err, data) {
                      if (err) {
                      reject(err);
                      } else {
                      db.attachment.insert(cloudantDocument._id, 'thumbnail.jpg', data, 'image/jpg', {rev:cloudantDocument._rev}, function(err, body) {
                               console.log("insert complete");
                               //console.log(body);
                               
                               //remove thumb file after saved to cloudant
                               var fs = require('fs');
                            fs.unlink(thumbFileName, function (err) { });
                               
                               if (err) {
                               console.log("ERROR DURING ATTACHMENT INSERT");
                               console.log(err);
                               reject(err);
                               } else {
                               console.log("saved thumbnail");
                               //console.log("Body is: " + JSON.stringify(body));
                               cloudantDocument._rev = body.rev;
                               console.log("Doc: " + JSON.stringify(cloudantDocument));
                               
                               resolve(cloudantDocument);
                               }
                        });
                      }
                      });
        });
        return promise;
        };
        
        //Process faces
        var p7 = function(cloudantDocument) {
        var promise = new Promise(function(resolve, reject) {
          console.log("Processing faces");
          processFaces(cloudantDocument, fileName, db, cloudantDocument.analysis, function (err) {
               if(err) {
                reject(err);
               } else {
                   var fs = require('fs');
                   fs.unlink(fileName, function (err) { reject(err);});
                   console.log("Finished processing faces");
                   resolve(cloudantDocument);
               }
            });
        });
        return promise;
        };
        
        return p0(cloudantDocument).then(p8).then(p2).then(p3).then(p4).then(p5).then(p6).then(p7);
        //console.log("Completed Analysis of Image");
        //return p0(cloudantDocument);
        
    } else {
        console.log("Ignoring cloudant changes");
    }
});
feed.follow();

//var changes_params = {since: "now", feed: "continuous"};
//
//cloudant.db.changes(dbName, changes_params, function(err, body) {
//
//
//
//});

// Web server
var app = express();
app.set('views', './public/views');
//app.set('view engine', 'jade');
app.set('view engine', 'pug');


// all environments
app.set('port', process.env.PORT || 3000);
app.use(logger('dev'));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(methodOverride());

//app.use(express.static(path.join(__dirname, 'public')));
app.use('/stylesheets', express.static(path.join(__dirname, '/public/stylesheets')));
app.use('/style', express.static(path.join(__dirname, '/public/stylesheets')));
app.use('/scripts', express.static(path.join(__dirname, '/public/scripts')));
app.use('/images', express.static(path.join(__dirname, '/public/images')));
app.use( '/public', express.static( __dirname + '/public' ) );

// development only
if ('development' == app.get('env')) {
    app.use(errorHandler());
}

function getDBCredentialsUrl(jsonData) {
    var vcapServices = JSON.parse(jsonData);
    // Pattern match to find the first instance of a Cloudant service in
    // VCAP_SERVICES. If you know your service key, you can access the
    // service credentials directly by using the vcapServices object.
    for (var vcapService in vcapServices) {
        if (vcapService.match(/cloudant/i)) {
            return vcapServices[vcapService][0].credentials.url;
        }
    }
}

app.get('/simulator', function(req, res){
    //res.sendfile('index_simulator.html', { root: __dirname} );
    res.sendFile(path.join(__dirname + '/public/index_simulator.html'));
});

app.get('/testingpurposes', function (req, res) {
    //for now just returning all images.
    //in the real world you would want to filter this list or truncate/page it

    db.view( 'image_db_images',  'image_db.images', function(err, body) {
        if (err) {
            console.log("Error during db view stage: " + err.toString());
            res.status(404).send(err.toString());
            return;
        }
        console.log("Body is: " + JSON.stringify(body));
        //this should really be sorted on the database
        body.rows = body.rows.sort(sortList);
        res.render("list", {body:body});

    });
});

app.get('/allimages', function (req, res) {
    //for now just returning all images.
    //in the real world you would want to filter this list or truncate/page it

    db.view( 'image_db_images',  'image_db.images', function(err, body) {
        if (err) {
            console.log("Error during db view stage: " + err.toString());
            res.status(404).send(err.toString());
            return;
        }
        console.log("Body is: " + JSON.stringify(body));
        //this should really be sorted on the database
        body.rows = body.rows.sort(sortList);
        res.render("list", {body:body});

    });
});

app.get('/needimmediateattention', function (req, res) {
    //for now just returning all images.
    //in the real world you would want to filter this list or truncate/page it

    db.view( 'image_db_images',  'image_db.images', function(err, body) {
        if (err) {
            console.log("Error during db view stage: " + err.toString());
            res.status(404).send(err.toString());
            return;
        }
        console.log("Body is: " + JSON.stringify(body));
        body.rows = body.rows.sort(sortList);
        var filtered_body = {};
        filtered_body.rows = [];

        //Count images that do need attention
        for (var i = 0; i < body.rows.length; i++) {
    		if(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score > 0.60 ||
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score > 0.60 ||
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score > 0.60 ||
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score > 0.60
    			//class[3] is Normal Condition, not needed here
    		) {
    			filtered_body.rows.push(body.rows[i]);
    		}
		}

        //console.log("Filtered DATA: " + JSON.stringify(filtered_body));
        res.render("list", {body:filtered_body});

    });
});

app.get('/mayneedattention', function (req, res) {
    //for now just returning all images.
    //in the real world you would want to filter this list or truncate/page it

    db.view( 'image_db_images',  'image_db.images', function(err, body) {
        if (err) {
            console.log("Error during db view stage: " + err.toString());
            res.status(404).send(err.toString());
            return;
        }
        console.log("Body is: " + JSON.stringify(body));
        //this should really be sorted on the database
        body.rows = body.rows.sort(sortList);

        var filtered_body = {};
        filtered_body.rows = [];

        //Count images that do need attention
        for (var i = 0; i < body.rows.length; i++) {
    		if((body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score > 0.40 &&
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score < 0.60) ||
    			(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score > 0.40 &&
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score < 0.60) ||
    			(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score > 0.40 &&
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score < 0.60) ||
    			(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score > 0.40 &&
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score < 0.60)
    			//class[3] is Normal Condition, not needed here
    		) {
    			filtered_body.rows.push(body.rows[i]);
    		}
		}

        res.render("list", {body:filtered_body});

    });
});

app.get('/doesnotneedattention', function (req, res) {
    //for now just returning all images.
    //in the real world you would want to filter this list or truncate/page it

    db.view( 'image_db_images',  'image_db.images', function(err, body) {
        if (err) {
            console.log("Error during db view stage: " + err.toString());
            res.status(404).send(err.toString());
            return;
        }
        console.log("Body is: " + JSON.stringify(body));
        //this should really be sorted on the database
        body.rows = body.rows.sort(sortList);

        var filtered_body = {};
        filtered_body.rows = [];

        //Count images that do need attention
        for (var i = 0; i < body.rows.length; i++) {
    		if(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score < 0.40 &&
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score < 0.40 &&
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score < 0.40 &&
    			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score < 0.40
    			//class[3] is Normal Condition, not needed here
    		) {
    			filtered_body.rows.push(body.rows[i]);
    		}
		}

        res.render("list", {body:filtered_body});

    });
});


app.get('/dashboardtesting', function (req, res) {
    db.view( 'image_db_images',  'image_db.images', function(err, body) {
        if (err) {
            console.log("Error during db view stage: " + err.toString());
            res.status(404).send(err.toString());
            return;
        }
        console.log("Body is: " + JSON.stringify(body));
        body.rows = body.rows.sort(sortList);

        console.log(JSON.stringify(body.rows));
        res.render("list", {body:body});

    });
});

app.get('/', function (req, res) {
    //for now just returning all image counts.
    //in the real world you would want to filter this list or truncate/page it

    db.view( 'image_db_images',  'image_db.images', function(err, body) {
        if (err) {
            console.log("Error during db view stage: " + err.toString());
            res.status(404).send(err.toString());
            return;
        }
        console.log("Body is: " + JSON.stringify(body));
        //this should really be sorted on the database
        body.rows = body.rows.sort(sortList);

        var red_count = 0;
        var yellow_count = 0;
        var green_count = 0;
		    var total_count = body.rows.length;



        for (var i = 0; i < body.rows.length; i++) {

          if ('analysis' in body.rows[i].key) {
        		if(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score < 0.40 &&
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score < 0.40 &&
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score < 0.40 &&
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score < 0.40 ) {
      			     green_count++;
      		  }
          }
		    }

		    //Count images that may need attention
        for (var i = 0; i < body.rows.length; i++) {

          if ('analysis' in body.rows[i].key) {
        		if((body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score > 0.40 &&
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score < 0.60) ||
        			(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score > 0.40 &&
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score < 0.60) ||
        			(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score > 0.40 &&
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score < 0.60) ||
        			(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score > 0.40 &&
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score < 0.60)) {
      			       yellow_count++;
            }
          }
    		}


		    //Count images that do need attention
        for (var i = 0; i < body.rows.length; i++) {
          if ('analysis' in body.rows[i].key) {
        		if(body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[0].score > 0.60 ||
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[1].score > 0.60 ||
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[2].score > 0.60 ||
        			body.rows[i].key.analysis.image_classify.images[0].classifiers[0].classes[3].score > 0.60 ) {
      			       red_count++;
      		  }
          }
		    }

        //console.log(JSON.stringify(body.rows));
        res.render("dashboard", {body:body, bodystring: JSON.stringify(body), total_count:total_count, green_count: green_count, yellow_count: yellow_count, red_count: red_count});

    });

});

app.get('/:id?/', function (req, res) {
    var id = req.params.id;
    db.get(id,function(err, body) {
        if (err) {
            console.log("Error during db get stage");
            res.status(404).send(err.toString());
            return;
        }
        res.render("detail", { body:body});
    });
});

app.get('/:id?/attachments/:fileName?', function (req, res) {
    var id = req.params.id;
    var fileName = req.params.fileName;
    db.attachment.get(id, fileName).pipe(res);
});

function sortList(a, b) {
    //return newest first
    if (a.key.sort > b.key.sort) {
        return -1;
    }
    if (a.key.sort < b.key.sort) {
        return 1;
    }
    return 0;
}

function createResponseData(id, name, value, attachments) {

    var responseData = {
        id: id,
        name: sanitizeInput(name),
        value: sanitizeInput(value),
        attachements: []
    };


    attachments.forEach(function(item, index) {
        var attachmentData = {
            content_type: item.type,
            key: item.key,
            url: '/api/favorites/attach?id=' + id + '&key=' + item.key
        };
        responseData.attachements.push(attachmentData);

    });
    return responseData;
}

function sanitizeInput(str) {
    return String(str).replace(/&(?!amp;|lt;|gt;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var saveDocument = function(id, name, value, response) {

    if (id === undefined) {
        // Generated random id
        id = '';
    }

    db.insert({
        name: name,
        value: value
    }, id, function(err, doc) {
        if (err) {
            console.log(err);
            response.sendStatus(500);
        } else
            response.sendStatus(200);
        response.end();
    });

}

app.get('/api/favorites/attach', function(request, response) {
    var doc = request.query.id;
    var key = request.query.key;

    db.attachment.get(doc, key, function(err, body) {
        if (err) {
            response.status(500);
            response.setHeader('Content-Type', 'text/plain');
            response.write('Error: ' + err);
            response.end();
            return;
        }

        response.status(200);
        response.setHeader("Content-Disposition", 'inline; filename="' + key + '"');
        response.write(body);
        response.end();
        return;
    });
});

app.post('/api/favorites/attachsimple', multipartMiddleware, function(request, response) {
         
         console.log("Upload Simple File Invoked..");
         console.log('Request: ' + JSON.stringify(request.headers));
         console.log("Request ID " + request.query.id);
         var id;
         
         db.get(-1, function(err, existingdoc) {
                
                var isExistingDoc = false;
                if (!existingdoc) {
                id = '-1';
                } else {
                id = existingdoc.id;
                isExistingDoc = true;
                }
                
                var name = sanitizeInput(request.query.name);
                var value = sanitizeInput("");
                
                //var file = request.files.file;
                //console.log("NEW FILE " + file);
                var filepath = './public/images/' + request.query.filepath;
                console.log("FILEPATH IS: " + filepath);
                //var newPath = './public/uploads/' + file.name;
                
                var insertAttachment = function(id, rev, name, value, response) {
                console.log("GOIGNG TO READ FILE");
                //fs.readFile(file.path, function(err, data) {
                fs.readFile(filepath, function(err, data) {
                            console.log("FILE HAS BEEN READ");
                            if (!err) {
                            
                                //if (file) {
                                db.attachment.insert(id, "image.jpg", data, "image/jpeg", {
                                //db.attachment.insert(id, file.name, data, file.type, {
                                    rev: rev
                                     }, function(err, document) {
                                     if (!err) {
                                     console.log('Attachment saved successfully.. ');
                                     //return;
                                     db.get(document.id, function(err, doc) {
                                            //console.log('Attachements from server --> ' + JSON.stringify(doc._attachments));
                                            
                                            var attachements = [];
                                            var attachData;
                                            for (var attachment in doc._attachments) {
                                            if (attachment == value) {
                                                attachData = {
                                                "key": attachment,
                                                "type": "image/jpeg"
                                                };
                                            } else {
                                                attachData = {
                                                "key": attachment,
                                                "type": doc._attachments[attachment]['content_type']
                                                };
                                            }
                                                attachements.push(attachData);
                                            }
                                            var responseData = createResponseData(
                                                                                  id,
                                                                                  name,
                                                                                  value,
                                                                                  attachements);
                                            //console.log('Response after attachment: \n' + JSON.stringify(responseData));
                                            response.write(JSON.stringify(responseData));
                                            response.end();
                                            return;
                                            });
                                     } else {
                                     console.log(err);
                                     }
                                     });
                            //} else {
                            //    console.log("THERE IS NO FILE");
                            //}
                            } else {
                            console.log("Error found after reading file: " + err);
                            }
                            });
                };
                
                if (!isExistingDoc) {
                existingdoc = {
                name: name,
                value: value,
                create_date: new Date()
                };
                
                // Create a date object with the current time
                var now = new Date();
                var year = now.getFullYear();
                //var month = now.getMonth();
                var month = ("0" + now.getMonth()).slice(-2);
                //var day = now.getDate();
                var day = ("0" + now.getDate()).slice(-2);
                //var hours = (now.getHours() % 12) || 12;
                //var hours = now.getHours();
                var hours = ("0" + now.getHours()).slice(-2);
                var minutes = ("0" + now.getMinutes()).slice(-2);
                //var minutes = now.getMinutes();
                //var seconds = now.getSeconds();
                var seconds = ("0" + now.getSeconds()).slice(-2);
                
                var now_timestamp = year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds + " +0000";
                console.log(now_timestamp);
                
                // save doc
                db.insert({
                          name: name,
                          value: value,
                          type: "image_db.image",
                          timestamp: now_timestamp,
                          longitude: -95.34,
                          latitude: 47.626773,
                          region: "uum5e",
                          altitude: 10,
                          heading: 152.6,
                          cameraPitch: 0,
                          cameraHeading: 152.5,
                          aircraft: "Phantom Drone PD148"
                          }, '', function(err, doc) {
                          if (err) {
                          console.log(err);
                          } else {
                          
                          existingdoc = doc;
                          console.log("New doc created ..");
                          console.log(existingdoc);
                          insertAttachment(existingdoc.id, existingdoc.rev, name, value, response);
                          
                          }
                          });
                
                } else {
                console.log('Adding attachment to existing doc.');
                console.log(existingdoc);
                insertAttachment(existingdoc._id, existingdoc._rev, name, value, response);
                }
                
                });
         
         
});

app.post('/api/favorites/attach', multipartMiddleware, function(request, response) {

console.log("Upload File Invoked..");
console.log('Request: ' + JSON.stringify(request.headers));
console.log("Request ID " + request.query.id);
var id;

attachmentInsert(request, response);

});

function attachmentInsert(request, response) {
    db.get(request.query.id, function(err, existingdoc) {
           
           var isExistingDoc = false;
           if (!existingdoc) {
           id = '-1';
           } else {
           id = existingdoc.id;
           isExistingDoc = true;
           }
           
           var name = sanitizeInput(request.query.name);
           var value = sanitizeInput(request.query.value);
           console.log("Original Name: " + name);
           console.log("Original Value: " + value);
           
           var file = request.files.file;
           console.log("Original File: " + file);
           
           var newPath = './public/uploads/' + file.name;
           console.log("Original File Name: " + newPath);
           
           var insertAttachment = function(file, id, rev, name, value, response) {
           
           fs.readFile(file.path, function(err, data) {
                       if (!err) {
                       
                       if (file) {
                       console.log("Original REV: " + rev);
                       db.attachment.insert(id, "image.jpg", data, file.type, {
                                            //db.attachment.insert(id, file.name, data, file.type, {
                                            rev: rev
                                            }, function(err, document) {
                                            if (!err) {
                                            console.log('Attachment saved successfully.. ');
                                            //return;
                                            db.get(document.id, function(err, doc) {
                                                   //console.log('Attachements from server --> ' + JSON.stringify(doc._attachments));
                                                   
                                                   var attachements = [];
                                                   var attachData;
                                                   for (var attachment in doc._attachments) {
                                                   if (attachment == value) {
                                                   attachData = {
                                                   "key": attachment,
                                                   "type": file.type
                                                   };
                                                   } else {
                                                   attachData = {
                                                   "key": attachment,
                                                   "type": doc._attachments[attachment]['content_type']
                                                   };
                                                   }
                                                   attachements.push(attachData);
                                                   }
                                                   var responseData = createResponseData(
                                                                                         id,
                                                                                         name,
                                                                                         value,
                                                                                         attachements);
                                                   //console.log('Response after attachment: \n' + JSON.stringify(responseData));
                                                   response.write(JSON.stringify(responseData));
                                                   response.end();
                                                   return;
                                                   });
                                            } else {
                                            console.log("Error in insert attachment: " + err);
                                            }
                                            });
                       }
                       }
                       });
           };
           
           if (!isExistingDoc) {
           existingdoc = {
           name: name,
           value: value,
           create_date: new Date()
           };
           
           // Create a date object with the current time
           var now = new Date();
           var year = now.getFullYear();
           //var month = now.getMonth();
           var month = ("0" + now.getMonth()).slice(-2);
           //var day = now.getDate();
           var day = ("0" + now.getDate()).slice(-2);
           //var hours = (now.getHours() % 12) || 12;
           //var hours = now.getHours();
           var hours = ("0" + now.getHours()).slice(-2);
           var minutes = ("0" + now.getMinutes()).slice(-2);
           //var minutes = now.getMinutes();
           //var seconds = now.getSeconds();
           var seconds = ("0" + now.getSeconds()).slice(-2);
           
           var now_timestamp = year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds + " +0000";
           console.log(now_timestamp);
           
           // save doc
           db.insert({
                     name: name,
                     value: value,
                     type: "image_db.image",
                     timestamp: now_timestamp,
                     longitude: -95.34,
                     latitude: 47.626773,
                     region: "uum5e",
                     altitude: 10,
                     heading: 152.6,
                     cameraPitch: 0,
                     cameraHeading: 152.5,
                     aircraft: "Phantom Drone PD148"
                     }, '', function(err, doc) {
                     if (err) {
                     console.log("Error in save doc: " + err);
                     } else {
                     
                     existingdoc = doc;
                     console.log("New doc created ..");
                     console.log(existingdoc);
                     insertAttachment(file, existingdoc.id, existingdoc.rev, name, value, response);
                     
                     }
                     });
           
           } else {
                console.log('Adding attachment to existing doc.');
                console.log(existingdoc);
                insertAttachment(file, existingdoc._id, existingdoc._rev, name, value, response);
           }
           
           });
    
};


app.post('/api/favorites', function(request, response) {

    console.log("Create Invoked..");
    console.log("Name: " + request.body.name);
    console.log("Value: " + request.body.value);

    // var id = request.body.id;
    var name = sanitizeInput(request.body.name);
    var value = sanitizeInput(request.body.value);

    saveDocument(null, name, value, response);

});

app.delete('/api/favorites', function(request, response) {

    console.log("Delete Invoked..");
    var id = request.query.id;
    // var rev = request.query.rev; // Rev can be fetched from request. if
    // needed, send the rev from client
    console.log("Removing document of ID: " + id);
    console.log('Request Query: ' + JSON.stringify(request.query));

    db.get(id, {
        revs_info: true
    }, function(err, doc) {
        if (!err) {
            db.destroy(doc._id, doc._rev, function(err, res) {
                // Handle response
                if (err) {
                    console.log(err);
                    response.sendStatus(500);
                } else {
                    response.sendStatus(200);
                }
            });
        }
    });

});

app.put('/api/favorites', function(request, response) {

    console.log("Update Invoked..");

    var id = request.body.id;
    var name = sanitizeInput(request.body.name);
    var value = sanitizeInput(request.body.value);

    console.log("ID: " + id);

    db.get(id, {
        revs_info: true
    }, function(err, doc) {
        if (!err) {
            console.log(doc);
            doc.name = name;
            doc.value = value;
            db.insert(doc, doc.id, function(err, doc) {
                if (err) {
                    console.log('Error inserting data\n' + err);
                    return 500;
                }
                return 200;
            });
        }
    });
});

app.get('/api/favorites', function(request, response) {

    console.log("Get method invoked.. ");

    db = cloudant.use(dbName);
    var docList = [];
    var i = 0;
    db.list(function(err, body) {
        if (!err) {
            var len = body.rows.length;
            console.log('total # of docs -> ' + len);
            if (len == 0) {
                // push sample data
                // save doc
                var docName = 'sample_doc';
                var docDesc = 'A sample Document';
                db.insert({
                    name: docName,
                    value: 'A sample Document'
                }, '', function(err, doc) {
                    if (err) {
                        console.log(err);
                    } else {

                        console.log('Document : ' + JSON.stringify(doc));
                        var responseData = createResponseData(
                            doc.id,
                            docName,
                            docDesc, []);
                        docList.push(responseData);
                        response.write(JSON.stringify(docList));
                        console.log(JSON.stringify(docList));
                        console.log('ending response...');
                        response.end();
                    }
                });
            } else {

                body.rows.forEach(function(document) {

                    db.get(document.id, {
                        revs_info: true
                    }, function(err, doc) {
                        if (!err) {
                            if (doc['_attachments']) {

                                var attachments = [];
                                for (var attribute in doc['_attachments']) {

                                    if (doc['_attachments'][attribute] && doc['_attachments'][attribute]['content_type']) {
                                        attachments.push({
                                            "key": attribute,
                                            "type": doc['_attachments'][attribute]['content_type']
                                        });
                                    }
                                    console.log(attribute + ": " + JSON.stringify(doc['_attachments'][attribute]));
                                }
                                var responseData = createResponseData(
                                    doc._id,
                                    doc.name,
                                    doc.value,
                                    attachments);

                            } else {
                                var responseData = createResponseData(
                                    doc._id,
                                    doc.name,
                                    doc.value, []);
                            }

                            docList.push(responseData);
                            i++;
                            if (i >= len) {
                                response.write(JSON.stringify(docList));
                                console.log('ending response...');
                                response.end();
                            }
                        } else {
                            console.log(err);
                        }
                    });

                });
            }

        } else {
            console.log(err);
        }
    });

});

//handle custom classifier retrain request
app.post('/:id?/retrain/:posneg?/:classifierId?/:classifierClass?', function (req, res) {
    var id = req.params.id;
    var posneg = req.params.posneg;
    var classifierId = req.params.classifierId;
    var classifierClass = req.params.classifierClass;
    var currentTime = new Date().getTime();

    if (posneg == "positive" || posneg == "negative"){
        console.log("retraining");

        var rootDir = './temp';
        var dir = rootDir + "/" + currentTime;

        if (!fs.existsSync(rootDir)){
            fs.mkdirSync(rootDir);
        }
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }

        var tempFile = dir + "/" + id + ".jpg";
        var resizedFile = dir + "/" + id + "-resize.jpg";
        var zipFile = dir + "/" + id + ".zip";

        var cleanup = function() {
            console.log("cleanup");
            fs.unlink(tempFile, function (err) { })
            fs.unlink(resizedFile, function (err) { })
            fs.unlink(zipFile, function (err) { })
            fs.rmdir(dir, function (err) { })
        }

        db.attachment.get(id, "image.jpg", function(err, attachmentBody) {
            if (err) {
                res.status(500).send(err.toString());
                cleanup();
            } else {
                //write image to disk
                          fs.writeFileSync(tempFile, attachmentBody, function (err) {if(err){throw err;}});

                //resize image
                gm(tempFile).define("jpeg:extent=900KB").write(resizedFile,
                function (err) {
                    if (err) {
                        res.status(500).send(err.toString());
                        cleanup();
                    }

                    //create zip containing the image so we can send it to watson
                    var output = fs.createWriteStream(zipFile);
                    var archive = archiver('zip');
                    archive.pipe(output);

                    archive.on('error', function(err) {
                        res.status(500).send(err.toString());
                        cleanup();
                    });

                    archive.on('finish', function(err) {

                        //post positive-reinforcement data to Visual Recognition classifier
                        var formData = {
                            api_key:vr_key,
                            version:"2016-05-20"
                        };

                        if (posneg == "positive") {
                            formData[classifierClass + "_positive_examples"] = fs.createReadStream(zipFile);
                        }
                        else {
                            formData[classifierClass + "_positive_examples"] = fs.createReadStream("./training/tennis_positive.zip");
                            formData["negative_examples"] = fs.createReadStream(zipFile);
                        }
                        var url = "https://apikey:" + vr_key + "gateway.watsonplatform.net/visual-recognition/api/v3/classifiers/" + classifierId +"?version=2018-03-19";

                        request.post({url:url, formData: formData}, function optionalCallback(err, httpResponse, body) {
                            if (err) {
                                res.status(500).send(err.toString());
                            } else {
                                var response = body.toString();
                                res.status(200).send(response);
                                console.log(response);
                            }
                            cleanup();
                        });

                    });

                    archive.file(resizedFile, { name: 'image.jpg' });
                    archive.finalize();
                });
            }
        });
    } else {
        res.status(500).send();
    }
});

/**
 * Prepares and analyzes the image.
 * processCallback = function(err, analysis);
 */
function processFaces(document, fileName, db, analysis, processCallback) {
    console.log("processing detected faces...");
    //console.log("DB VALUE IS: " + JSON.stringify(db));
    var fs = require('fs');
    
    if (analysis && analysis.hasOwnProperty("face_detection")) {
        console.log("analysis has face_detection");
        
        var faceIndex = -1,
        facesToProcess = [],
        latestDocument = document;
        
        if (analysis.face_detection.images){
            if (analysis.face_detection.images.length > 0) {
                var images = analysis.face_detection.images;
                if (images[0].faces) {
                    facesToProcess = analysis.face_detection.images[0].faces;
                }
            }
        }
        
        //iteratively create images for each face that is detected
        var inProgressCallback = function (err) {
            console.log("inside inProgressCallback");
            faceIndex++;
            
            if (err) {
                processCallback( err );
                console.log("Error during process of faces: " + err)
            } else {
                if (faceIndex < facesToProcess.length) {
                    console.log('generating face ' + (faceIndex+1) + " of " + facesToProcess.length);
                    generateFaceImage(fileName, facesToProcess[faceIndex], "face" + faceIndex +".jpg", function(err, faceImageName) {
                                      
                                      if (err) {
                                      inProgressCallback(err);
                                      } else {
                                      
                                      //save to cloudant
                                      console.log("saving face image: " + faceImageName);
                                      fs.readFile(faceImageName, function(readErr, data) {
                                                  if (readErr) {
                                                  console.log("readErr reached");
                                                  inProgressCallback(err);
                                                  } else {
                                                  console.log("ABOUT TO INSERT FACE ATTACHMENT");
                                                  console.log("AND DOC IS: " + JSON.stringify(latestDocument));
                                                  console.log("AND REV IS: " + latestDocument._rev);
                                                  console.log("AND faceImageName IS: " + faceImageName);
                                                  //console.log("DB VALUE IS: " + JSON.stringify(db));
                                                  //console.log("TWO DB IS : " + JSON.stringify(db));
                                                  
                                                  db.attachment.insert(latestDocument._id, faceImageName, data, 'image/jpg',
                                                                       {rev:latestDocument._rev}, function(saveErr, body) {
                                                                       if (!saveErr){
                                                                       console.log("insert complete");
                                                                       console.log("AFTER INSERT COMPLETE BODY IS: " + JSON.stringify(body));
                                                                       console.log("SAVE ERROR IS: " + saveErr);
                                                                       latestDocument._id = body.id;
                                                                       latestDocument._rev = body.rev;
                                                                       
                                                                       //remove thumb file after saved to cloudant
                                                                       var fs = require('fs');
                                                                       fs.unlink(faceImageName, function (err) { });
                                                                       
                                                                       console.log("saved thumbnail");
                                                                       inProgressCallback(saveErr);
                                                                       
                                                                       } else {
                                                                       console.log("SAVE ERROR IS: " + saveErr);
                                                                       return {ERROR: "Error during save faces"};
                                                                       }
                                                                       
                                                                       });
                                                  }
                                                  });
                                      
                                      }
                                      });
                } else {
                    processCallback(null)
                }
            }
        }
        
        inProgressCallback(null);
    }  ;
}

/**
 * Prepares the image, resizing it if it is too big for Watson or Alchemy.
 * prepareCallback = function(err, fileName);
 */
function generateFaceImage(fileName, faceData, faceImageName, callback) {
    
    console.log('inside generateFaceImage');
    var
    fs = require('fs'),
    async = require('async'),
    gm = require('gm').subClass({
                                imageMagick: true
                                });
    
    var face_location = faceData["face_location"];
    
    gm(fileName)
    .crop(face_location.width, face_location.height, face_location.left, face_location.top)
    .write(faceImageName, function (err) {
           if (err) {
           console.log(err);
           callback( err );
           } else {
           console.log('face image generation done: ' + faceImageName);
           callback(null, faceImageName);
           }
           });
}


/**
 * Prepares and analyzes the image.
 * processCallback = function(err, analysis);
 */
function processThumbnail(doc, fileName, thumbFileName, processCallback) {
    console.log("thumbfile name before generate: " + thumbFileName);
    generateThumbnail(fileName, thumbFileName, function (err) {
                      console.log("thumbfile name after generate: " + thumbFileName);
                      
                      //save to cloudant
                      processCallback(err, doc, thumbFileName);
                      });
}

/**
 * Prepares the image, resizing it if it is too big for Watson or Alchemy.
 * prepareCallback = function(err, fileName);
 */
function generateThumbnail(fileName, thumbFileName, callback) {
    console.log("Inside of generateThumbnail");
    var
    fs = require('fs'),
    async = require('async'),
    gm = require('gm').subClass({
                                imageMagick: true
                                });
    console.log("Starting GM:");
    gm(fileName)
    .resize(200, 200)
    .write(thumbFileName, function (err) {
           if (err) {
           console.log(err);
           callback( err );
           } else {
           console.log('thumb generation done');
           callback(null, thumbFileName);
           }
           });
    console.log("completed thumbnail writing");
    
}


/**
 * Prepares and analyzes the image.
 * processCallback = function(err, analysis);
 */
function processImage(doc, fileName, processCallback) {
    prepareImage(fileName, function (prepareErr, prepareFileName) {
                 if (prepareErr) {
                 processCallback(prepareErr, null);
                 } else {
                 analyzeImage(doc, prepareFileName, function (err, analysis) {
                              processCallback(err, analysis);
                              });
                 }
                 });
}

/**
 * Prepares the image, resizing it if it is too big for Watson or Alchemy.
 * prepareCallback = function(err, fileName);
 */
function prepareImage(fileName, prepareCallback) {
    console.log("Prepare Image Method starting");
    var
    fs = require('fs'),
    async = require('async'),
    gm = require('gm').subClass({
                                imageMagick: true
                                });
    
    async.waterfall([
                     function (callback) {
                     // Retrieve the file size
                     fs.stat(fileName, function (err, stats) {
                             if (err) {
                             callback(err);
                             } else {
                             callback(null, stats);
                             }
                             });
                     },
                     // Check if size is OK
                     function (fileStats, callback) {
                     if (fileStats.size > 900 * 1024) {
                     // Resize the file
                     gm(fileName).define("jpeg:extent=900KB").write(fileName + ".jpg",
                                                                    function (err) {
                                                                    if (err) {
                                                                    callback(err);
                                                                    } else {
                                                                    // Process the modified file
                                                                    callback(null, fileName + ".jpg");
                                                                    }
                                                                    });
                     } else {
                     callback(null, fileName);
                     }
                     }
                     ], function (err, fileName) {
                    prepareCallback(err, fileName);
                    });
}

/**
 * Analyzes the image stored at fileName with the callback onAnalysisComplete(err, analysis).
 * analyzeCallback = function(err, analysis);
 */
function analyzeImage(doc, fileName, analyzeCallback) {
    console.log("Starting Analyze Image Method");
    var
    request = require('request'),
    async = require('async'),
    fs = require('fs'),
    gm = require('gm').subClass({
                                imageMagick: true
                                }),
    analysis = {};
    
    async.parallel([
                    function (callback) {
                    // Write down meta data about the image
                    gm(fileName).size(function (err, size) {
                                      if (err) {
                                      console.log("Image size", err);
                                      } else {
                                      analysis.size = size;
                                      }
                                      callback(null);
                                      });
                    },
                    function (callback) {
                    // Call Watson Visual Recognition Face Detection passing the image in the request
                    fs.createReadStream(fileName).pipe(
                                                       request({
                                                               method: "POST",
                                                               url: "https://apikey:" + vr_key + "@gateway.watsonplatform.net" +
                                                               "/visual-recognition/api/v3/detect_faces" +
                                                               "?version=2018-03-19",
                                                               headers: {
                                                               'Content-Length': fs.statSync(fileName).size
                                                               },
                                                               json: true
                                                               },
                                                               function (err, response, body) {
                                                               if (err) {
                                                               console.log("Face Detection ERROR: ", err);
                                                               analysis.face_detection = {
                                                               error:err
                                                               }
                                                               } else {
                                                               console.log("Face Detection SUCCESS:")
                                                               console.log(body)
                                                               analysis.face_detection = body;
                                                               }
                                                               callback(null);
                                                               }))
                    },
                    function (callback) {
                    // Call Watson Visual Recognition Image Classifier passing the image in the request
                    console.log('CLASSIFIERS:' + vr_classifiers)
                    fs.createReadStream(fileName).pipe(
                           request({
                                   method: "POST",
                                   url: "https://apikey:" + vr_key + "@gateway.watsonplatform.net" +
                                   "/visual-recognition/api/v3/classify" +
                                   "?version=2018-03-19&threshold=0.0&owners=me,IBM&classifier_ids=" + vr_classifiers,
                                   headers: {
                                   'Content-Length': fs.statSync(fileName).size
                                   },
                                   json: true
                                   },
                                   function (err, response, body) {
                                   if (err) {
                                   console.log("Image Classifier ERROR", err);
                                   analysis.image_classify = {
                                   error:err
                                   }
                                   } else {
                                   console.log("Image Classifier SUCCESS:")
                                   console.log(JSON.stringify(body))
                                   analysis.image_classify = body;
                                   }
                                   callback(null);
                                   }))
                    },
                    function (callback) {
                    // Call Watson Visual Recognition 'Recognize Text' passing the image in the request
                    fs.createReadStream(fileName).pipe(
                                                       request({
                                                               method: "POST",
                                                               url: "https://apikey:" + vr_key + "@gateway.watsonplatform.net" +
                                                               "/visual-recognition/api/v3/recognize_text" +
                                                               "?version=2018-03-19",
                                                               headers: {
                                                               'Content-Length': fs.statSync(fileName).size
                                                               },
                                                               json: true
                                                               },
                                                               function (err, response, body) {
                                                               if (err) {
                                                               console.log("Recognize Text ERROR", err);
                                                               analysis.recognize_text = {
                                                               error:err
                                                               }
                                                               } else {
                                                               console.log("Recognize Text SUCCESS:")
                                                               console.log(body)
                                                               analysis.recognize_text = body;
                                                               }
                                                               callback(null);
                                                               }))
                    }
                    ],
                   function (err, result) {
                   analyzeCallback(err, analysis);
                   }
                   )
}

/**
 * Update a document in Cloudant database:
 * https://docs.cloudant.com/document.html#update
 **/

function cloudantupdatemain(message) {
    var cloudantOrError = getCloudantAccount(message);
    if (typeof cloudantOrError !== 'object') {
        return Promise.reject(cloudantOrError);
    }
    var cloudant = cloudantOrError;
    var dbName = message.dbname;
    var doc = message.doc;
    var params = {};
    
    if(!dbName) {
        return Promise.reject('dbname is required.');
    }
    
    if (typeof message.doc === 'object') {
        doc = message.doc;
    } else if (typeof message.doc === 'string') {
        try {
            doc = JSON.parse(message.doc);
        } catch (e) {
            return Promise.reject('doc field cannot be parsed. Ensure it is valid JSON.');
        }
    } else {
        return Promise.reject('doc field is ' + (typeof doc) + ' and should be an object or a JSON string.');
    }
    if(!doc || !doc.hasOwnProperty("_rev")) {
        return Promise.reject('doc and doc._rev are required.');
    }
    var cloudantDb = cloudant.use(dbName);
    
    if (typeof message.params === 'object') {
        params = message.params;
    } else if (typeof message.params === 'string') {
        try {
            params = JSON.parse(message.params);
        } catch (e) {
            return Promise.reject('params field cannot be parsed. Ensure it is valid JSON.');
        }
    }
    
    return insert(cloudantDb, doc, params);
}

/**
 * Inserts updated document into database.
 */
function insert(cloudantDb, doc, params) {
    return new Promise(function(resolve, reject) {
                       cloudantDb.insert(doc, params, function(error, response) {
                                         if (!error) {
                                         console.log('success', response);
                                         resolve(response);
                                         } else {
                                         console.log('error', error);
                                         reject(error);
                                         }
                                         });
                       });
}

function getCloudantAccount(message) {
    // full cloudant URL - Cloudant NPM package has issues creating valid URLs
    // when the username contains dashes (common in IBM Cloud scenarios)
    var cloudantUrl;
    
    if (message.url) {
        // use IBM Cloud binding
        cloudantUrl = message.url;
    } else {
        if (!message.host) {
            return 'cloudant account host is required.';
        }
        if (!message.username) {
            return 'cloudant account username is required.';
        }
        if (!message.password) {
            return 'cloudant account password is required.';
        }
        
        cloudantUrl = "https://" + message.username + ":" + message.password + "@" + message.host;
    }
    
    return require('cloudant')({
                               url: cloudantUrl
                               });
}

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds){
            break;
        }
    }
}

// Start listening
var port = ( process.env.PORT || 3000 );
app.listen( port );
console.log( 'Application is listening at: ' + port );
