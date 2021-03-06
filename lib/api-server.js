#!/usr/bin/env node
var log = require('./logging.js'),
    path = require('path'),
    http = require('http'),
    express = require('express'),
    imgSize = require('image-size'),
    bodyParser = require('body-parser'),
    compression = require('compression'),
    app = express(),
    request = require('request'),
    async = require('async'),
    _teams = [],
    max_images = 50,
    approvedTeams = [],
    fs = require('fs'),
    afterHackathon = new Date(2015, 2, 8),
    glob = require('glob');

var config;
/**
 * The server configuration should be in the format:
 * {
 *    eventbrite: {
 *      eventId: "string-with-id",
 *      oathToken: "super-not-so-secret-token"
 *    },
 *    imagesDir: "directory-where-the-hosted-images-are"
 * }
 */
exports.startServer = function(serverConfig) {
  config = serverConfig;

  console.log("Server config: " + JSON.stringify(config));

  var server = createServer();
  startServer(server);
  return server;
};

function createServer() {
  app.set('port', 3000);
  app.use(compression());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  app.get("/api/teams", getTeamInfo);
  app.get("/api/spots", getRemainingSpots);
  app.get("/api/imgs/:year?", getImageNames);

  setUpErrorLogging();

  return http.createServer(app);
}


function startServer(server) {
  server.listen(app.get('port'), function(){
    log.info('Express server listening on port ' + app.get('port'));
    update();
  });
}

/********************************* API End Points *****************************/

function getImageNames(req, res) {
  console.log("IMG Query: " + JSON.stringify(req.query));

  var year = req.query.year;
  var file_ext = req.query.ext; //default parameter is jpg
  var img_path = config.imagesDir;
  var skip = req.query.skip;

  if(!skip) {
    skip = 0;
  }

  if(year) {
    img_path = path.join(img_path, year);
  }

  if(!file_ext) {
    file_ext = "jpg";
  }

  img_path = path.join(img_path, "**", "*." + file_ext); //for globbing
  log.info("Path: " + img_path);
  glob(img_path, function(err, names) {

    var chunk = names.slice(skip, skip+max_images);

    var imgs = [];
    for(var i = 0; i < chunk.length; i++) {

      var size = imgSize(chunk[i]);
      //update file path so it works from browser
      var filepath = chunk[i].replace(config.imagesDir, "hosted_images");

      //calculate minipath
      var filepath_mini = filepath.replace(year, year + '_mini');

      var img = {
        link: filepath,
        link_mini: filepath_mini,
        width: size.width,
        height: size.height
      }
      imgs.push(img);

    }
    res.send({imgs: imgs,
              moreImages: (names.length > skip+max_images) ? true : false});
  });
}

function getRemainingSpots(req, res) {
  var remainingSpots = 0;
  var request_url = "https://www.eventbriteapi.com/v3/events/" + 
      config.eventbrite.eventId + "?token=" + config.eventbrite.oathToken;

  if(new Date() > afterHackathon) {
    //after the hackathon, there are no spots
    res.send({remainingSpots: 0});
  } else {
    request(request_url, function(err, response, body) {
      if(!err && response.statusCode === 200) {
        body = JSON.parse(body);
        body.ticket_classes.forEach(function addSeats(ticket_type) {
          remainingSpots += ticket_type.quantity_sold;
        });
      } else {
        log.error("Error: " + JSON.stringify(err));
        log.error("response code: " + JSON.stringify(response.statusCode));
      }
      res.send({remainingSpots: (250 - remainingSpots)});
    });
  }
}


function getTeamInfo(req, res) {
  //Don't send teams after the hackathon
  if(new Date() > afterHackathon) {
    res.send([]);
  } else {
    res.send(approvedTeams);
  }
}

/************************** Team Processing Functions *************************/

//Happened more commonly in old versions. 
function removeDuplicates(list) {
  var uniqueArr = list.filter(function(elem, pos) {
    return list.indexOf(elem) == pos;
  });
  return uniqueArr;
}

function processResponse(err, team, creator) {
  if(creator) {
    var response = getUserResponse(creator.answers);

    if(response.approved) {
      var teamObj = {
        name: team.name,
        members: team.attendee_count,
        description: response.description,
        captain: {
          name: creator.profile.name,
          email: creator.profile.email
        }
      };
      _teams.push(teamObj);
    }
  }
}

function getCreator(team, attendees, cb) {
  attendees.forEach(function(attendee) {
    if(team.creator.emails[0].email === attendee.profile.email) {
      cb(null, team, attendee);
    }
  });
  cb(null);
}

function getUserResponse(questions) {
  var response = {
    approved: false,
    description: null
  };

  questions.forEach(function(answer) {
    if(answer.question_id === "8622569") { 
      //"question": "Would you like to have your team listed on our Team finder page?",
      if(answer.answer === "Yes, I am looking for additional members") {
        response.approved = true;
      }

    } else if(answer.question_id === "8622571") {
      if(typeof(answer.answer) !== "undefined") {
        response.description = answer.answer;
      }
    }
  });

  return response;
}

function removeHiddenTeams(teams, attendees) {
  var visible_teams = [],
    answered = false,
    approved = false,
    description = null,
    captain = null;

  for(var i = 0; i < teams.length; i++) {
    var team = teams[i];
    getCreator(team, attendees, processResponse);
  }

  _teams = removeDuplicates(_teams); //ensure it is free of dups
}

//removes small teams
function filterTeams(teams) {
  var filtered = [];
  teams.forEach(function(team) {
    if(team.attendee_count < 3) {
      filtered.push(team);
    }
  });
  //console.log(filtered.length + " teams have < 3 people on them");
  return filtered;
}

function isObject(input) {
  if(typeof(input) === 'object' && !Array.isArray(input)) {
    return true;
  }
  return false;
}

/************************* EVENTBRITE API Requests ****************************/
var requestTeams = function(callback) {
  var request_url = "https://www.eventbriteapi.com/v3/events/" + 
      config.eventbrite.eventId + "/teams/?token=" + config.eventbrite.oathToken;

  make_request(request_url, callback);
};

var requestAttendees = function(callback) {
  var request_url = "https://www.eventbriteapi.com/v3/events/" + 
      config.eventbrite.eventId + "/attendees/?token=" + config.eventbrite.oathToken;

  make_request(request_url, callback);
};

function make_request(url, callback) {
  function actual_request(url, callback) {
    request(url, function(err, response, body) {
      if(!err && response.statusCode === 200) {
        callback(err, JSON.parse(body));
      } else {
        log.error("Error: " + JSON.stringify(err));
        log.error("response code: " + JSON.stringify(response.statusCode));
        callback(err);
      }
    }); 
  }

  //To assist with the pagination of results
  function page(url, field, callback) {
    actual_request(url, function(err, body) {
      if(err) {
        callback(err, results); //return the results we already have
      }
      callback(err, body[field]);
    });
  }

  actual_request(url, function(err, body) {
    if(err) {
      callback(err); 
    }
    if(isObject(body)) {
      try {
        var field = Object.keys(body)[1]; //gets the field after pagination
      } catch(e) {
        log.error("Exception trying to get the keys of: " + body);
      }
      
      if(body.pagination.page_number < body.pagination.page_count) {
        var results = body[field];
        var tasks = [];

        for(var i = 2; i <= body.pagination.page_count; i++) {
          var pageURL = url + '&page=' + i;
          tasks.push(async.apply(page, pageURL, field));
        }

        async.parallel(tasks, function(err, _results) {

          _results.forEach(function(result) {
            results = results.concat(result);
          });

          callback(err, results);
        });
      } else {
        callback(err, body[field]);
      }
    } else {
      log.info("Body is a: " + typeof(body));
    }
  }); 
}

var processResults = function(err, results) {
  if(!err) {
    var attendees = results[0];
    var teams = results[1];

    teams = filterTeams(teams);
    removeHiddenTeams(teams, attendees);

    approvedTeams = _teams;
    _teams = [];
    //Make sure these are empty. They should be
    attendees = [];
    teams = [];
  } else {
    log.error("Error getting results: " + JSON.stringify(err));
  }
};


function update() {
  var now = new Date();
  //If it's before the hackathon, keep updating
  if(now < afterHackathon) {
    log.error("Updating at " + now.toLocaleString());
    async.parallel([
      requestAttendees,
      requestTeams
    ],
    processResults);
  }
}


function setUpErrorLogging() {
  app.use(function(err, req, res, next) {
    if(!err) return next();
    log.error("Error: ".red + JSON.stringify(err));
    log.error(err.stack);
    if(!res.headersSent) {
      res.json({error: err});
    }
  });
}


var updateInterval = setInterval(function() {
  update();
}, 1000 * 60 * 15); //update every 15 minutes
