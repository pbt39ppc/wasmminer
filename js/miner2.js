  var host = 'jp.kotopool.work'
  var port = '3332'
  var user = 'k1123tmA1dm7t4UfAPvn5gAfa3qz6sDuFZf'
  var pass = 'x'
  var cores = navigator.hardwareConcurrency;
  if (cores == null) {
    cores = 4;
  }

  var setdiff = function(work, diff){
    work['diff'] = diff;
  };

  var noncestr2int = function(noncestr){
    var x = parseInt(noncestr, 16);
    var y = ((x & 0x000000ff) * Math.pow(2,24)) +
            ((x & 0x0000ff00) << 8) +
            ((x & 0x00ff0000) >> 8) +
            ((x >> 24) & 0xff);
    return y;
  };

  const workers = [];
  var ws = null;
  var start =  function(){
    var auth = false;
    ws = new WebSocket("wss://kotocoin.info/proxy");
    ws.onopen = function(ev) {
      console.log('open');

      var msg = {"id": 0, "method": "proxy.connect", "params": []};
      msg.params[0] = host
      msg.params[1] = port
      ws.send(JSON.stringify(msg) + "\n");

      auth = false;
      msg = {"id": 1, "method": "mining.subscribe", "params": []};
      var user_agent = 'webminer/0.1';
      var session_id = null;
      msg.params[0] = user_agent;
      if (session_id) {
        msg.params[1] = session_id;
      }
      ws.send(JSON.stringify(msg) + "\n");
    };
    ws.onclose = function(ev) {
      console.log('close');
      start();	
    };
    var work = {};
    ws.onmessage = function(ev) {
      console.log('message: ' + ev.data);
      var doauth = false;
      var json = JSON.parse(ev.data);
      var result = json.result;
      if (result) {
        var res0 = result[0];
        if (json.id == 1) {
          var res00 = res0[0];
          var res000 = res00[0];
          if (res000 == 'mining.set_difficulty') {
            var xnonce1 = result[1];
            var xnonce2len = result[2];
            work['sessionid'] = res00[1];
            work['xnonce1'] = xnonce1;
            work['xnonce2len'] = xnonce2len;
            console.log('mining.mining.notify 1: ' + work);
            doauth = true;
          }
        }
      }
      if (json.id == 4 && !json.method) {
        if (json.result) {
          console.log("yay");
        }
        else {
          console.log("boo");
        }
      }
      var method = json.method;
      var params = json.params;
      if (json.id == null) {
        if (method == 'mining.set_difficulty') {
          var diff = params[0];
          console.log('mining.set_difficulty: ' + diff);
          setdiff(work, diff);
        }
        else if (method == 'mining.notify') {
          work['jobid'] = params[0];
          work['prevhash'] = params[1];
          work['coinb1'] = params[2];
          work['coinb2'] = params[3];
          work['merkles'] = params[4];
          work['version'] = params[5];
          work['nbits'] = params[6];
          work['ntime'] = params[7];
          work['clean'] = params[8];
          console.log('mining.notify 2: ' + work);
          for (var i = 0; i < cores; i++) {
            var worker = workers[i];
            if (worker) {
              worker.terminate();
            }
            worker = new Worker('js/em.js');
            var now = new Date();
            worker.startt = now.getTime();
            worker.startn = Math.floor(0xffffffff / cores * i);
            worker.coren = i;
            workers[i] = worker;
            worker.onmessage = function(e) {
              var result = e.data;
              console.log('recv from worker: ' + result);
              var xnonce2 = result[0];
              var nonce = result[1];
              var hashstr = result[2];
              var hashi = noncestr2int(hashstr.substr(-8));
              var noncei = noncestr2int(nonce);
              console.log('nonce int = ' + noncei);
              var username = user
              var msg = {"id": 4, "method": "mining.submit",
                "params": [username, work.jobid, xnonce2, work.ntime, nonce]
              };
              ws.send(JSON.stringify(msg) + "\n");
              var now = new Date();
              var endt = now.getTime();
              var difft = endt - this.startt;
              var diffn = noncei - this.startn;
              var speed = 1000.0*diffn/difft;
              this.startt = endt;
              noncei++;
              work['nonce'] = noncei;
              console.log('restart nonce', noncei);
              this.startn = noncei;
              this.postMessage(work);
            }
          }
          for (var i = 0; i < cores; i++) {
            var worker = workers[i];
            work['nonce'] = Math.floor(0xffffffff / cores * i);
            console.log('start nonce', work['nonce']);
            worker.postMessage(work);
          }
        }
      }
      if (!auth && doauth) {
        auth = true;
        msg = {"id": 2, "method": "mining.authorize", "params": []};
        msg.params[0] = user
        msg.params[1] = pass
        ws.send(JSON.stringify(msg) + "\n");
      }
    };
    ws.onerror = function(ev) {
      console.log('error');
      for (var i = 0; i < workers.length; i++) {
        var worker = workers[i];
        if (worker) {
          worker.postMessage('stop');
          workers[i] = null;
        }
      }
      start();
    };
    return false;
  }
