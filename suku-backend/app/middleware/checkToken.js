// 验证token是否有效
'use strict';
const ERRORMSG = require('../extend/errorCode');
module.exports = (options, app) => {
  return async function checkToken(ctx, next) {
    const { header, url } = ctx.request;

    // 除登录接口外，其它接口需要验证token有效性
    if (url !== '/login' && url !== '/logout' && url !== '/getCaptcha') {
      const requestToken = header['x-csrf-token'];
      const loginUserInfo = ctx.helper.loginUser.parse(ctx.cookies.get('loginUserInfo')) || {};
      const tokenName = loginUserInfo.username;
      const redisToken = await app.redis.get(tokenName);

      if (redisToken === null || requestToken !== redisToken) {
        ctx.body = {
          code: ERRORMSG.TOKEN_PAST_DUE.CODE,
          success: false,
          msg: ERRORMSG.TOKEN_PAST_DUE.MSG,
          data: null,
        };
        return;
      }

      // 未过期的话，再重新设置超时时间为半个小时
      ctx.service.token.resetExpire(tokenName);
    }

    await next();

  };
};
