'use strict';

const PermissionRules = {
  id: {
    type: 'int?',
  },
  name: {
    type: 'string?',
  },
  displayName: {
    type: 'string?',
  },
  permissions: {
    type: 'array?',
  },
  roleId: {
    type: 'int?',
  },
};

module.exports = PermissionRules;
