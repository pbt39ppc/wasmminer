$(function(){
  var cores = navigator.hardwareConcurrency;
  if (cores == null) {
    cores = 4;
  }
  $('#threads').children().remove();
  for (var i = 1; i <= cores; i++) {
    $('#threads').append($('<option>').attr({ value: i }).text(i));
  }
  $('#threads').val(cores);
  $('#meter').text("");
  $('#meter').append('Speed: (hashes/s)<br>');
  for (var i = 1; i <= cores; i++) {
    $('#meter').append('Worker '+i+': <span id="meter'+i+'">-.-</span><br>')
  }
    
  var setparams = function(){
    var host = location.search.match(/h=(.*?)(&|$)/);
    var port = location.search.match(/p=(.*?)(&|$)/);
    var user = location.search.match(/u=(.*?)(&|$)/);
    var pass = location.search.match(/P=(.*?)(&|$)/);
    if (host) { $('#host').val(host[1]); }
    if (port) { $('#port').val(port[1]); }
    if (user) { $('#username').val(user[1]); }
    if (pass) { $('#password').val(pass[1]); }
  };
  setparams();

  var setdiff = function(work, diff){
    work['diff'] = diff;
    $('#message').text('Current difficulty: ' + diff);
  };

  var noncestr2int = function(noncestr){
    var x = parseInt(noncestr, 16);
    var y = ((x & 0x000000ff) * Math.pow(2,24)) +
            ((x & 0x0000ff00) << 8) +
            ((x & 0x00ff0000) >> 8) +
            ((x >> 24) & 0xff);
    return y;
  };

  var rarity = function(hashi){
    var rstr = 'n';
    if (hashi < 0x1000) {
      rstr = 'ur';
    }
    else if (hashi < 0x4000) {
      rstr = 'sr';
    }
    else if (hashi < 0x10000) {
      rstr = 'r';
    }
    else if (hashi < 0x40000) {
      rstr = 'nr';
    }
    rstr = '#rare_' + rstr;
    $(rstr).show();
    var c = parseInt($(rstr + '_count').text());
    c++;
    $(rstr + '_count').text(c);
  };

  $('#bench').click(function(){
    var worker = new Worker('js/em.js');
    var now = new Date();
    worker.startt = now.getTime();
    worker.startn = '536873249'; // answer is 536873749 '0x150b0020'

    worker.onmessage = function(e) {
      var result = e.data;
      var noncestr = result[1];
      console.log('recv from worker: ' + result);
      var noncei = noncestr2int(noncestr) & 0xffffffff;
      var now = new Date();
      var endt = now.getTime();
      var difft = endt - this.startt;
      var diffn = noncei - this.startn;
      var speed = 1000.0*diffn/difft;
      $('#meter1').text(parseInt(speed) + " (" + diffn + "/" + difft/1000 + ")");
      $('#message').text('Benchmark... Done.');
    }
    var work = {};
    work['jobid'] = '870';
    work['clean'] = false;

    work['prevhash'] = '5dd9604f0b662342e7d2b5518dd284c4' +
                       'fa1e80228d0b74e0da40ddd24120a8bf';
    work['coinb1'] = '010000000100000000000000000000000000000000000000' +
                     '00000000000000000000000000ffffffff20037f86000467' +
                     '5e505a08'
    setdiff(work, 0.5);
    work['coinb2'] = '0d2f6e6f64655374726174756d2fffffffff023beb51d601' +
                     '0000001976a914a4e47780f16cb0f4617946417edaa60a00' +
                     '77857388ac552ec004000000001976a91452d162b995a7da' +
                     '28fc9c3512857f80d82e9a3b3488ac00000000';
    work['xnonce1'] = '0800005c';
    work['merkles'] = ['30f9fd04c5ee86e8f225e454278cc78dc9be6c69d40a92d40de560e2ccd578d7'];
    work['version'] = '00000004';
    work['nbits'] = '1d3571b8';
    work['xnonce2len'] = 4;
    work['xnonce2'] = '00000000';
    work['ntime'] = '5a505e67';
    work['nonce'] = worker.startn; // expected nonce: 536873749

    $('.status').hide();
    $('#message').show();
    $('#message').text('Benchmark...');
    worker.postMessage(work);
  });

  $('#save').click(function(){
    var host = $('#host').val();
    var port = $('#port').val();
    var user = $('#username').val();
    var pass = $('#password').val();
    location.search = '?h=' + host + '&p=' + port + '&u=' + user + '&P=' + pass;
    return false;
  });
  const workers = [];
  var ws = null;
  $('#start').click(function(){
    $('#start').prop('disabled', true);
    $('#stop').prop('disabled', false);
    var auth = false;
    ws = new WebSocket("wss://kotocoin.info/proxy");
    ws.onopen = function(ev) {
      console.log('open');
      $('.status').hide();
      $('#connected').show();

      var msg = {"id": 0, "method": "proxy.connect", "params": []};
      msg.params[0] = $('#host').val();
      msg.params[1] = $('#port').val();
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
      $('.status').hide();
      $('#disconnected').show();
    };
    var work = {};
    ws.onmessage = function(ev) {
      console.log('message: ' + ev.data);
      $('.status').hide();
      $('#message').show();
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
          $('#yay').show();
          var yc = parseInt($('#yaycount').text());
          yc++;
          $('#yaycount').text(yc);
        }
        else {
          $('#boo').show();
          var bc = parseInt($('#boocount').text());
          bc++;
          $('#boocount').text(bc);
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
          for (var i = 0; i < $('#threads').val(); i++) {
            var worker = workers[i];
            if (worker) {
              worker.terminate();
            }
            worker = new Worker('js/em.js');
            var now = new Date();
            worker.startt = now.getTime();
            worker.startn = Math.floor(0xffffffff / $('#threads').val() * i);
            worker.coren = i;
            workers[i] = worker;
            worker.onmessage = function(e) {
              var result = e.data;
              console.log('recv from worker: ' + result);
              var xnonce2 = result[0];
              var nonce = result[1];
              var hashstr = result[2];
              var hashi = noncestr2int(hashstr.substr(-8));
              rarity(hashi);
              var noncei = noncestr2int(nonce);
              console.log('nonce int = ' + noncei);
              var username = $('#username').val();
              var msg = {"id": 4, "method": "mining.submit",
                "params": [username, work.jobid, xnonce2, work.ntime, nonce]
              };
              ws.send(JSON.stringify(msg) + "\n");
              var now = new Date();
              var endt = now.getTime();
              var difft = endt - this.startt;
              var diffn = noncei - this.startn;
              var speed = 1000.0*diffn/difft;
              $('#meter' + (this.coren + 1)).text(parseInt(speed) + " (" + diffn + "/" + difft/1000 + ")");
              this.startt = endt;
              noncei++;
              work['nonce'] = noncei;
              console.log('restart nonce', noncei);
              this.startn = noncei;
              this.postMessage($.extend({}, work));
            }
          }
          for (var i = 0; i < $('#threads').val(); i++) {
            var worker = workers[i];
            work['nonce'] = Math.floor(0xffffffff / $('#threads').val() * i);
            console.log('start nonce', work['nonce']);
            worker.postMessage($.extend({}, work));
          }
        }
      }
      if (!auth && doauth) {
        auth = true;
        msg = {"id": 2, "method": "mining.authorize", "params": []};
        msg.params[0] = $('#username').val();
        msg.params[1] = $('#password').val();
        ws.send(JSON.stringify(msg) + "\n");
      }
    };
    ws.onerror = function(ev) {
      console.log('error');
      $('.status').hide();
      $('#error').show();
      for (var i = 0; i < workers.length; i++) {
        var worker = workers[i];
        if (worker) {
          worker.postMessage('stop');
          workers[i] = null;
        }
      }
    };
    return false;
  });
  $('#stop').click(function(){
    ws.close();
    for (var i = 0; i < $('#threads').val(); i++) {
      var worker = workers[i];
      if (worker) {
        worker.terminate();
      }
    }
    $('#start').prop('disabled', false);
    $('#stop').prop('disabled', true);
    return false;
  });
});
