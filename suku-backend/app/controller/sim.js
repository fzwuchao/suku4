'use strict';

const BaseController = require('../core/baseController');

class SimController extends BaseController {
  // 查询
  async search() {
    const { ctx } = this;
    const { request, service, helper } = ctx;
    const { pageRules, sim } = helper.rules;

    const rule = {
      ...sim(),
      ...pageRules,
    };

    const params = Object.keys(rule).reduce((acc, cur) => {
      if (cur in request.query || cur in request.queries) {
        acc[cur] = rule[cur].type.includes('array') ? request.queries[`${cur}`] : request.query[cur];
      }
      return acc;
    }, {});

    ctx.validate(rule, params);
    const pageData = await service.sim.getSimPageData(params);
    this.success(pageData, '');
  }

  async exportExcel() {
    const { ctx } = this;
    const { request, service, helper } = ctx;
    const { sim } = helper.rules;

    const rule = {
      ...sim(),
    };

    const params = Object.keys(rule).reduce((acc, cur) => {
      if (cur in request.query || cur in request.queries) {
        acc[cur] = rule[cur].type.includes('array') ? request.queries[`${cur}`] : request.query[cur];
      }
      return acc;
    }, {});

    ctx.validate(rule, params);
    const excelSimData = await service.sim.getSimDataForExcel(params);
    const jsonExcel = JSON.parse(JSON.stringify(excelSimData, null, 2));
    const buffer = await service.sheet.generateWorkbookBuffer(jsonExcel);
    // application/octet-stream application/vnd.openxmlformats application/msexcel
    this.ctx.set('Content-Type', 'application/msexcel');
    this.ctx.set('Content-disposition', 'attachment; filename=1.xlsx');
    // this.success(buffer, '');
    this.ctx.body = buffer;
  }

  /**
   * 导入excel文件
   * 头字段包括: MSISDN，ICCID
   */
  async importSimsWithHeadField() {
    const { ctx } = this;
    const { request, service, helper } = ctx;
    const { sim } = helper.rules;
    const rule = {
      ...sim([
        'activeComboId', 'activeComboName',
        'otherComboIds', 'uid', 'uname',
        'onelinkId', 'onelinkName',
        'simType',
        'filepath',
      ]),
    };
    const params = { ...request.body };
    ctx.validate(rule, params);

    const simExcelHeadField = [ 'MSISDN', 'ICCID' ];
    const result = await service.sheet.parseFileWithHeadField(params.filepath);
    // 解析完成后，删除tmp-file/下对应的文件
    await service.sheet.removeFile(params.filepath);
    if (!result.parseSuccess) {
      this.fail(null, null, result.msg);
      return;
    }

    const sheetData = result.sheetData;
    const simIdList = sheetData.map(item => item[simExcelHeadField[0]]);
    const mapSimIdToCount = {};
    // 表中的sim卡号验重
    simIdList.forEach(simId => {
      if (!mapSimIdToCount[simId]) {
        mapSimIdToCount[simId] = 1;
      } else {
        mapSimIdToCount[simId] += mapSimIdToCount[simId];
      }
    });
    const repeatSimIdsInFile = Object.keys(mapSimIdToCount).filter(simId => mapSimIdToCount[simId] > 1);
    if (repeatSimIdsInFile.length > 0) {
      ctx.logger.error(`【表中，sim卡号存在重复的】: ${repeatSimIdsInFile}`);
      this.fail(null, repeatSimIdsInFile, '表中，sim卡号存在重复的');
      return;
    }

    const repeatSimIdList = await service.sim.getRepeatSimIds(simIdList);
    // 表格中的sim卡号与数据库中的验重
    if (repeatSimIdList.length > 0) {
      const repeatIds = repeatSimIdList.map(item => item.simId);
      ctx.logger.error(`【数据库中，sim卡号已存在】: ${repeatIds}`);
      this.fail(null, repeatIds, '数据库中，sim卡号已存在');
      return;
    }
    // 激话套餐的流量、语音时长、续费价格
    const {
      monthSumFlowThreshold,
      monthVoiceDurationThreshold,
      renewPrice,
    } = await service.simCombo.getSimComboById(params.activeComboId);
    const simList = sheetData.map(item => {
      const simId = item[simExcelHeadField[0]];
      const iccid = item[simExcelHeadField[1]];
      return {
        simId,
        iccid,
        activeComboId: params.activeComboId,
        activeComboName: params.activeComboName,
        otherComboIds: params.otherComboIds,
        uid: params.uid,
        uname: params.uname,
        onelinkId: params.onelinkId,
        onelinkName: params.onelinkName,
        simType: params.simType,
        monthSumFlowThreshold,
        monthVoiceDurationThreshold,
        renewPrice,
      };
    });

    try {
      const result = await service.sim.bulkCreate(simList);
      if (result) {
        // 生成入库记录
        await service.simLogistics.create({
          receiver: params.uname,
          receiverId: params.uid,
          total: simList.length,
        });
        this.success('', '导入成功');
      } else {
        this.fail('', '', '导出失败');
      }

    } catch (error) {
      this.fail('', '', error.message);
    }
  }

  /**
   * 导入excel文件
   * 文件格式：第一列是simId，没有头字段
   */
  async importSims() {
    const { ctx } = this;
    const { request, service, helper } = ctx;
    const { sim } = helper.rules;
    const rule = {
      ...sim([
        'activeComboId', 'activeComboName',
        'otherComboIds', 'uid', 'uname',
        'onelinkId', 'onelinkName',
        'simType',
        'filepath',
      ]),
    };
    const params = { ...request.body };
    ctx.validate(rule, params);

    const result = await service.sheet.parseSimIdFile(params.filepath);
    // 解析完成后，删除tmp-file/下对应的文件
    await service.sheet.removeFile(params.filepath);

    if (!result.parseSuccess) {
      this.fail(null, null, result.msg);
      return;
    }

    const simIdList = result.sheetData;

    const mapSimIdToCount = {};
    // 表中的sim卡号验重
    simIdList.forEach(simId => {
      if (!mapSimIdToCount[simId]) {
        mapSimIdToCount[simId] = 1;
      } else {
        mapSimIdToCount[simId] += mapSimIdToCount[simId];
      }
    });
    const repeatSimIdsInFile = Object.keys(mapSimIdToCount).filter(simId => mapSimIdToCount[simId] > 1);
    if (repeatSimIdsInFile.length > 0) {
      ctx.logger.error(`【表中，sim卡号存在重复的】: ${repeatSimIdsInFile}`);
      this.fail(null, repeatSimIdsInFile, '表中，sim卡号存在重复的');
      return;
    }

    const repeatSimIdList = await service.sim.getRepeatSimIds(simIdList);
    // 表格中的sim卡号与数据库中的验重
    if (repeatSimIdList.length > 0) {
      const repeatIds = repeatSimIdList.map(item => item.simId);
      ctx.logger.error(`【数据库中，sim卡号已存在】: ${repeatIds}`);
      this.fail(null, repeatIds, '数据库中，sim卡号已存在');
      return;
    }
    // 激话套餐的流量、语音时长、续费价格
    const {
      monthSumFlowThreshold,
      monthVoiceDurationThreshold,
      renewPrice,
    } = await service.simCombo.getSimComboById(params.activeComboId);
    const simList = simIdList.map(simId => {
      return {
        simId,
        activeComboId: params.activeComboId,
        activeComboName: params.activeComboName,
        otherComboIds: params.otherComboIds,
        uid: params.uid,
        uname: params.uname,
        onelinkId: params.onelinkId,
        onelinkName: params.onelinkName,
        simType: params.simType,
        monthSumFlowThreshold,
        monthVoiceDurationThreshold,
        renewPrice,
      };
    });

    try {
      const result = await service.sim.bulkCreate(simList);
      if (result) {
        // 生成入库记录
        await service.simLogistics.create({
          receiver: params.uname,
          receiverId: params.uid,
          total: simList.length,
        });
        this.success('', '导入成功');
      } else {
        this.fail('', '', '导出失败');
      }

    } catch (error) {
      this.fail('', '', error.message);
    }
  }

  async getSim() {
    const ctx = this.ctx;
    const { request, service, helper } = ctx;
    const { sim } = helper.rules;
    const rule = {
      ...sim(),
    };
    ctx.validate(rule, request.query);
    const { simId } = request.query;
    const result = await service.sim.getSimBySimId(simId);
    this.success(result, '');
  }

}
module.exports = SimController;
