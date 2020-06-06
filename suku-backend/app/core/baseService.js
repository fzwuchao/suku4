'use strict';

const { Service } = require('egg');
const { Op } = require('sequelize');
const uniqid = require('uniqid');
class BaseService extends Service {
  getCurUser() {
    const curUser = this.ctx.helper.loginUser.parse(this.ctx.cookies.get('loginUserInfo')) || {};
    return curUser;
  }
  getOp() {
    return Op;
  }
  autoOrder(length) {
    const { helper } = this.ctx;
    let str = `${uniqid()}${helper.rnd(1000, 9999)}`;
    str = (str.toUpperCase()).substring(0, length);
    return str;
  }
  async findAndCountAll(modelNmale, pageSize, pageNum, query) {
    const { helper } = this.ctx;
    const result = await this.app.model[modelNmale].findAndCountAll({ ...query, ...helper.pageQueryModel(pageSize, pageNum) });

    return helper.pageModel(result, pageSize, pageNum);
  }

}

module.exports = BaseService;
