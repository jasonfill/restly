/***
  
  RESTly API Framework, based on Express

***/

var _       = require('underscore'),
    fs      = require('fs'),
    routes  = require('./lib/routes.js'),
    caching  = require('./lib/caching.js');
    

// global for exporting
var restly = {};

// set up express
var express = require('express');
var app = express();

app.disable('x-powered-by');

// force express to parse posted and putted parameters
app.use(express.bodyParser({ keepExtensions: true, uploadDir: '/tmp' }));

// define public directory for docs
app.use(express.static(__dirname+'/public'));

// wrapper for passing middleware to express
restly.use = function(mw) {
  app.use(mw);
}

// init
restly.init = function(r, opts) {
  config = {};
  if(opts.config){
    config = opts.config;
  }

  // make sure all our defaults are set
  var opts = defaultOpts(opts);

  // get our routes
  var routesCollection = routes.getRoutes(r);

  var error_opts = getErrors(r);

  // for each route
  for(var rc in routesCollection) {
    
    var apicall = routesCollection[rc];
    /*
    // add authentication object to apicall
    if (apicall.authentication) {
      
      // get authentication methods
      apicall.authentication = routes.getAuthentication(r, apicall.authentication);

      // combine api call params with authentication params
      apicall = routes.combineWithAuthentication(apicall);

      routesCollection[rc] = apicall;
    }
    */

    var _libSplit = apicall.library.split("/");
    
    apicall.outputLibrary = process.cwd()+"/"+opts.outputs+_libSplit[_libSplit.length-1];

    // get the full and correct path for the library
    apicall.library = process.cwd()+"/"+opts.lib+apicall.library;

    /*
    // and for the authentication library, if required
    if (apicall.authentication && apicall.authentication.library) {
      apicall.authentication.library = process.cwd()+"/"+opts.lib+apicall.authentication.library;
    } 
    */

    // are we enabling caching?
    if (!opts.caching || !apicall.caching) {
      apicall.caching = false;
    }

    else {
      apicall.caching = caching.parseOptsCache(opts.caching);

      // add special _use_cache param to API call
      apicall.parameters._use_cache = {
        "required": false,
        "type": "bool",
        "description":"Do you want to read from the cache",
        "default": true
      }
    }
    

    app.use(function(req, res, next) {
      if(req.headers.origin){
        res.header("Access-Control-Allow-Origin", req.headers.origin);
      }else{
        res.header("Access-Control-Allow-Origin", "*");  
      }
      res.header("Access-Control-Allow-Headers", "X-Requested-With");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Authorization");
      res.header("Access-Control-Expose-Headers", "X-Webhooksio-Request-Id,X-Webhooksio-Version");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
      // add the version being served up...
      if(config.version){
        res.header("X-Webhooksio-Version", config.version);
      }
      
      next();
    });

    // set up a express listener for each call
    switch(apicall.method) {
      case 'put': 
         (function(ac, error_opts) {
          routes.parseRoute(ac);
          app.put(ac.endpoint_parsed.endpoint, function(req, res) {
            routes.parseRequest(ac, req, res, error_opts);  
          });
        })(apicall, error_opts);
        break;


      case 'post':
          (function(ac, error_opts) {
          routes.parseRoute(ac);
          app.post(ac.endpoint_parsed.endpoint, function(req, res) {
            routes.parseRequest(ac, req, res, error_opts);  
          });
        })(apicall, error_opts);
        break;


      case 'delete': 
          (function(ac, error_opts) {
          routes.parseRoute(ac);
          app.delete(ac.endpoint_parsed.endpoint, function(req, res) {
            routes.parseRequest(ac, req, res, error_opts);  
          });
        })(apicall, error_opts);
        break;

        case 'get': 
        (function(ac, error_opts) {
          routes.parseRoute(ac);
          app.get(ac.endpoint_parsed.endpoint, function(req, res) {
            routes.parseRequest(ac, req, res, error_opts);  
          });
        })(apicall, error_opts);
        break;
    }
  }

  var docs_endpoints = opts.docs_endpoint.split(",");

  // documentation page
  for(var d=0; d<docs_endpoints.length; d++){
    app.get(docs_endpoints[d], function(req, res) {
      // prepare the page data
      var page = { 
                    routes: routesCollection,
                    config: opts
                  };
      
      // render the channel list page
      res.render(process.cwd()+"/node_modules/restly/views/index.jade", page);
    });
  }
  
  // if no route was found, 
  app.use(function(req, res){
    routes.invalidRoute(req, res, error_opts);
  });

  app.use(function(err, req, res, next){
    if(err.errorCode && err.errorCode == "InvalidAuthenticationInfo"){
      routes.invalidAuthetication(req, res, error_opts);
    }else{
      routes.internalError(err, req, res, error_opts);  
    }
  });

  // listen on the specified port
  var server = app.listen(opts.port);
  console.log("Listing on port: " + opts.port);

  // this function is called when you want the server to die gracefully
  // i.e. wait for existing connections
  var gracefulShutdown = function() {
    console.log("Received kill signal, shutting down gracefully.");
    server.close(function() {
      console.log("Closed out remaining connections.");
      process.exit()
    });
    
    // if after 
    setTimeout(function() {
        console.error("Could not close connections in time, forcefully shutting down");
        process.exit()
   }, 3*1000);
    
  }

  // listen for TERM signal .e.g. kill <pid>
  process.on ('SIGTERM', gracefulShutdown);

  // listen for INT signal e.g. Ctrl-C
  process.on ('SIGINT', gracefulShutdown);

}


// return parsed errors
var getErrors = function(r) {
  
  // verify routes are supplied correctly
  if (_.isUndefined(r) || !_.isString(r) || !fs.existsSync(r)) {
    console.log('Routes file not supplied or not present.');
    process.exit(0);
  }

  r = fs.readFileSync(r, {encoding: 'utf-8'});

  try {
    r = JSON.parse(r);
  } catch(e) {
    console.log('Cannot parse routes file as JSON');
    console.log(e);
    process.exit(0);
  }

  return r.errors;
}



// default options
var defaultOpts = function(opts) {

  // define defaults
  var defaults = {
    lib: "",
    outputs: "outputs/",
    protocol: "http",
    domain: "localhost",
    port: 8000,
    name: "My API",
    description: "Interactive API docs",
    docs_endpoint: "/",
    caching: false,
  }

  // change defaults with supplied opts
  if (!_.isUndefined(opts) && _.isObject(opts)) {

    for (var o in opts) {

      if (!_.isUndefined(defaults[o])) {
        defaults[o] = opts[o];
      }

    }

  }

  // check for sane protocol values
  if (!_.isString(defaults.protocol)) { defaults.protocol = "http"; }
  defaults.protocol = defaults.protocol.toLowerCase();
  if (defaults.protocol != 'http' && defaults.protocol != 'https') { defaults.protocol = 'http'; }
  
  // sane port values
  if (!_.isNumber(defaults.port)) { defaults.port = 8000; }

  // return
  return defaults;

}

// export
module.exports = restly