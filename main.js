const fs = require("fs");
const https = require("https");
const jayson = require('jayson');

// create a client
const client = jayson.client.http("http://127.0.0.1:6800/jsonrpc");

var log4js = require('log4js');
log4js.configure({
  appenders: {
    out: { type: 'stdout', layout: {
      type: 'pattern',
      pattern: '[%d{hh:mm:ss}][%[%p%]] %m'
    }},
    app: { type: 'file', filename: '0.log' , layout: {
      type: 'pattern',
      pattern: '[%d{hh:mm:ss}][%p] %m'
    }}
  },
  categories: { default: { appenders: ['out','app'], level: 'debug' } }
});
var Logger = log4js.getLogger();
Logger.level = 'debug';

var avs = [];
var succ = 0;
main();
setInterval(main,60000);

function main(){
  avs = [];
  succ = 0;
  var configfile = fs.readFileSync("config.json");
  var config = JSON.parse(configfile);
  for (var season of config.season){
    https.get('https://www.biliplus.com/api/bangumi?season=' + season, res => {
      var result = "";
      res.on('data', (d) => {
        result+=d;
      });
      res.on('end', () => {
        var json = JSON.parse(result);
        if (json.result == undefined){
          Logger.error(json);
          return;
        }
        var ep = json.result.episodes;
        for (var av of ep){
          if (av["episode_status"]==13){
            Logger.debug("season="+json.result.season_id+";"+json.result.title+" av="+av["av_id"]+" "+av["index"]+":"+av["index_title"]);
            avs.push(parseInt(av["av_id"]));
          }
        }
        succ ++;
        if(succ == config.season.length) {
          for (var av of config.av){
            avs.push(parseInt(av));
            Logger.debug("av add="+av);
          }
          for (var av of config.nav){
            if (avs.indexOf(av)!=-1){
              delete avs[avs.indexOf(av)];
              Logger.debug("av del="+av);
            }
          }
          getVideo();
        }
      })
    }).on('error', (e) => {
      console.error(e);
    });
  }
}
function getVideo(){
  Logger.debug("Start getVideo");
  for(var av in avs){
    if(isNaN(av)){
      continue;
    }
    if (fs.existsSync("save/av"+avs[av]+".flv")){
      Logger.info("av"+avs[av]+" exists, skip.");
    }else{
      //https://www.biliplus.com/api/geturl?bangumi=1&av=75356991&page=1
      https.get('https://www.biliplus.com/api/geturl?bangumi=1&page=1&av=' + avs[av], res => {
        var result = "";
        var av = res.req.path.match("[0-9]+$");
        Logger.info("Getting: av"+av);
        res.on('data', (d) => {
          result+=d;
        });
        res.on('end', () => {
          var json = JSON.parse(result);
          var ep = json.mode;
          if (json.mode == "error"){
            Logger.warn("Failed."+json.data.replace(/<[^>]+>/g,"").substring(0,30));
            return;
          }else if(json.mode=="video"){
            var data=json.data;
            for(vi of data){
              var url = vi.parts[0].url;
              if (url.match(/-([0-9]+)\.flv\?/)[1]>=80){
                Logger.info("Success: "+url.match(/-([0-9]+)\.flv\?/)[1]);
                client.request('aria2.addUri', [[url], {'dir':'X:\\biliplus\\save','out':"av"+av+".flv"}], function(err, response) {
                  Logger.debug("Success: "+response.result); // 2
                });
                return;
              }
            }
            Logger.info("no match");
          }else{
            Logger.info(json);
          }
        })
      }).on('error', (e) => {
        console.error(e);
      });
    }
  }
}