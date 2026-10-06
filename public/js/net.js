/** WebSocket 客户端：自动重连 + 消息分发 */
(function (global) {
  const Net = {
    ws: null,
    handlers: {},
    url: null,
    retries: 0,
    onStatus: null,

    connect(url) {
      Net.url = url;
      const ws = new WebSocket(url);
      Net.ws = ws;
      ws.onopen = () => {
        Net.retries = 0;
        Net.onStatus && Net.onStatus('connected');
      };
      ws.onclose = () => {
        Net.onStatus && Net.onStatus('disconnected');
        Net.retries++;
        const delay = Math.min(8000, 400 * Net.retries);
        setTimeout(() => Net.connect(Net.url), delay);
      };
      ws.onerror = () => { Net.onStatus && Net.onStatus('error'); };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        const h = Net.handlers[msg.type];
        if (h) h.forEach(fn => fn(msg));
        const any = Net.handlers['*'];
        if (any) any.forEach(fn => fn(msg));
      };
    },

    on(type, fn) {
      (Net.handlers[type] = Net.handlers[type] || []).push(fn);
    },

    send(obj) {
      if (Net.ws && Net.ws.readyState === 1) Net.ws.send(JSON.stringify(obj));
    },

    /** 发送玩家指令 */
    act(name, args) { Net.send({ type: 'act', name, args: args || {} }); },

    /** 发送 GM 指令 */
    gm(cmd, args) { Net.send({ type: 'gm', cmd, args: args || {} }); }
  };

  global.Net = Net;
})(window);
