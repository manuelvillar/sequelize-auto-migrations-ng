const Sequelize = require('sequelize');
const hash = require('object-hash');
const _ = require('lodash');
const { diff } = require('deep-diff');
const beautify = require('js-beautify').js_beautify;

const fs = require('fs');
const path = require('path');

function reverseSequelizeColType(col, prefix = 'Sequelize.') {
  const attrObj = col.type;
  const options = (col.type.options)
    ? col.type.options
    : {};

  // Sequelize.CHAR
  if (attrObj instanceof Sequelize.CHAR) {
    if (options.binary) { return `${prefix}CHAR.BINARY`; }

    return `${prefix}CHAR(${options.length})`;
  }

  // Sequelize.STRING
  if (attrObj instanceof Sequelize.STRING) {
    return `${prefix}STRING${
      (options.length)
        ? `(${options.length})`
        : ''
    }${(options.binary)
      ? '.BINARY'
      : ''}`;
  }

  // Sequelize.TEXT
  if (attrObj instanceof Sequelize.TEXT) {
    if (!options.length) { return `${prefix}TEXT`; }

    return `${prefix}TEXT(${options.length.toLowerCase()})`;
  }

  // Sequelize.DOUBLE
  if (attrObj instanceof Sequelize.DOUBLE) {
    if (!options.length) { return `${prefix}DOUBLE`; }

    return `${prefix}DOUBLE(${options.length.toLowerCase()})`;
  }

  // Sequelize.NUMBER:
  // INTEGER, BIGINT, FLOAT, REAL, DOUBLE
  if (attrObj instanceof Sequelize.NUMBER) {
    let ret = attrObj.key;
    if (options.length) {
      ret += `(${options.length}`;
      if (options.decimals) { ret += `, ${options.decimals}`; }
      ret += ')';
    }

    ret = [ret];

    if (options.zerofill) { ret.push('ZEROFILL'); }

    if (options.unsigned) { ret.push('UNSIGNED'); }

    return prefix + ret.join('.');
  }

  // ARRAY

  if (attrObj instanceof Sequelize.ARRAY) { return `${prefix}ARRAY(${reverseSequelizeColType(attrObj, prefix)})`; }

  // Sequelize.ENUM
  if (attrObj instanceof Sequelize.ENUM) { return `${prefix}ENUM('${options.values.join("', '")}')`; }

  // Simple types
  if (attrObj instanceof Sequelize.BOOLEAN) { return `${prefix}BOOLEAN`; }

  if (attrObj instanceof Sequelize.TIME) { return `${prefix}TIME`; }

  if (attrObj instanceof Sequelize.DATEONLY) { return `${prefix}DATEONLY`; }

  if (attrObj instanceof Sequelize.DATE) { return `${prefix}DATE`; }

  // Not documented, really?
  if (attrObj instanceof Sequelize.HSTORE) { return `${prefix}HSTORE`; }

  if (attrObj instanceof Sequelize.JSONB) { return `${prefix}JSONB`; }

  if (attrObj instanceof Sequelize.JSON) { return `${prefix}JSON`; }

  if (attrObj instanceof Sequelize.UUID) { return `${prefix}UUID`; }

  // Virtual data type, we must to skip it
  if (attrObj instanceof Sequelize.VIRTUAL) { return `${prefix}VIRTUAL`; }

  return undefined;

  // other types
  // if(typeof attrObj['options'] !== 'undefined' && typeof attrObj['options'].toString === 'function')
  //    return attrObj['options'].toString(sequelize);

  // @todo
  // BLOB
  // RANGE
  // ARRAY
  // GEOMETRY
  // GEOGRAPHY
}

function reverseSequelizeDefValueType(defaultValue, prefix = 'Sequelize.') {
  if (typeof defaultValue.fn !== "undefined") {
    return {
      internal: true,
      value: `${prefix}fn('${defaultValue.fn}')`,
    };
  }

  if (defaultValue instanceof Sequelize.NOW) {
    return {
      internal: true,
      value: `${prefix}NOW`,
    };
  }

  if (defaultValue instanceof Sequelize.UUIDV1) {
    return {
      internal: true,
      value: `${prefix}UUIDV1`,
    };
  }

  if (defaultValue instanceof Sequelize.UUIDV4) {
    return {
      internal: true,
      value: `${prefix}UUIDV4`,
    };
  }

  if (typeof defaultValue === 'function') { return { notSupported: true, value: '' }; }

  return { value: defaultValue };
}

function parseIndex(idx) {
  delete idx.parser;
  if (idx.type === '') { delete idx.type; }

  const options = {};

  if (idx.name) { options.indexName = idx.name; } // The name of the index. Default is __

  // @todo: UNIQUE|FULLTEXT|SPATIAL
  if (idx.unique) { options.indicesType = 'UNIQUE'; }

  // Set a type for the index, e.g. BTREE. See the documentation of the used dialect
  if (idx.method) { options.indexType = idx.type; }

  if (idx.parser && idx.parser !== '') { options.parser = idx.parser; } // For FULLTEXT columns set your parser

  idx.options = options;

  idx.hash = hash(idx);

  //   console.log ('PI:', JSON.stringify(idx, null, 4));
  return idx;
}

function reverseModels(sequelize, models) {
  const tables = {};

  console.log(models);

  delete models.default;

  for (const model in models) {
    const attributes = models[model].attributes;

    for (const column in attributes) {
      delete attributes[column].Model;
      delete attributes[column].fieldName;
      delete attributes[column].field;

      for (const property in attributes[column]) {
        if (property.startsWith('_')) {
          delete attributes[column][property];
          continue;
        }

        if (property === 'defaultValue') {
          const _val = reverseSequelizeDefValueType(attributes[column][property]);
          if (_val.notSupported) {
            console.log(`[Not supported] Skip defaultValue column of attribute ${model}:${column}`);
            delete attributes[column][property];
            continue;
          }
          attributes[column][property] = _val;
        }

        if (property === 'validate') { delete attributes[column][property]; }

        // remove getters, setters...
        if (typeof attributes[column][property] === 'function') { delete attributes[column][property]; }
      }

      if (typeof attributes[column].type === 'undefined') {
        console.log(`[Not supported] Skip column with undefined type ${model}:${column}`);
        delete attributes[column];
        continue;
      }

      let seqType = reverseSequelizeColType(attributes[column]);

      // NO virtual types in migration
      if (seqType === 'Sequelize.VIRTUAL') {
        console.log(`[SKIP] Skip Sequelize.VIRTUAL column "${column}"", defined in model "${model}"`);
        delete attributes[column];
        continue;
      }

      if (!seqType) {
        if (typeof attributes[column].type.options !== 'undefined' && typeof attributes[column].type.options.toString === 'function') { seqType = attributes[column].type.options.toString(sequelize); }

        if (typeof attributes[column].type.toString === 'function') { seqType = attributes[column].type.toString(sequelize); }
      }

      attributes[column].seqType = seqType;

      delete attributes[column].type;
      delete attributes[column].values; // ENUM
    }

    tables[models[model].tableName] = {
      tableName: models[model].tableName,
      schema: attributes,
    };

    if (models[model].options.indexes.length > 0) {
      const idx_out = {};
      for (const _i in models[model].options.indexes) {
        const index = parseIndex(models[model].options.indexes[_i]);
        idx_out[`${index.hash}`] = index;
        delete index.hash;

        // make it immutable
        Object.freeze(index);
      }
      models[model].options.indexes = idx_out;
    }

    tables[models[model].tableName].indexes = models[model].options.indexes;
  }

  return tables;
}

function parseDifference(previousState, currentState) {
  //   console.log(JSON.stringify(currentState, null, 4));
  const actions = [];
  const difference = diff(previousState, currentState);

  for (const _d in difference) {
    const df = difference[_d];
    //   console.log (JSON.stringify(df, null, 4));
    switch (df.kind) {
      // add new
      case 'N':
        {
          // new table created
          if (df.path.length === 1) {
            const depends = [];
            const tableName = df.rhs.tableName;
            _.each(df.rhs.schema, (v) => {
              if (v.references) { depends.push(v.references.model); }
            });

            actions.push({
              actionType: 'createTable', tableName, attributes: df.rhs.schema, options: {}, depends,
            });

            // create indexes
            if (df.rhs.indexes) {
              for (const _i in df.rhs.indexes) {
                actions.push(_.extend({
                  actionType: 'addIndex',
                  tableName,
                  depends: [tableName],
                }, _.clone(df.rhs.indexes[_i])));
              }
            }
            break;
          }

          const tableName = df.path[0];
          const depends = [tableName];

          if (df.path[1] === 'schema') {
            // if (df.path.length === 3) - new field
            if (df.path.length === 3) {
              // new field
              if (df.rhs && df.rhs.references) { depends.push(df.rhs.references.model); }

              actions.push({
                actionType: 'addColumn', tableName, attributeName: df.path[2], options: df.rhs, depends,
              });
              break;
            }

            // if (df.path.length > 3) - add new attribute to column (change col)
            if (df.path.length > 3) {
              if (df.path[1] === 'schema') {
                // new field attributes
                const options = currentState[tableName].schema[df.path[2]];
                if (options.references) { depends.push(options.references.nodel); }

                actions.push({
                  actionType: 'changeColumn', tableName, attributeName: df.path[2], options, depends,
                });
                break;
              }
            }
          }

          // new index
          if (df.path[1] === 'indexes') {
            const tableName = df.path[0];
            const index = _.clone(df.rhs);
            index.actionType = 'addIndex';
            index.tableName = tableName;
            index.depends = [tableName];
            actions.push(index);
            break;
          }
        }
        break;

        // drop
      case 'D':
        {
          const tableName = df.path[0];
          const depends = [tableName];

          if (df.path.length === 1) {
            // drop table
            actions.push({ actionType: 'dropTable', tableName, depends: [] });
            break;
          }

          if (df.path[1] === 'schema') {
            // if (df.path.length === 3) - drop field
            if (df.path.length === 3) {
              // drop column
              actions.push({
                actionType: 'removeColumn', tableName, columnName: df.path[2], depends: [tableName],
              });
              break;
            }

            // if (df.path.length > 3) - drop attribute from column (change col)
            if (df.path.length > 3) {
              // new field attributes
              const options = currentState[tableName].schema[df.path[2]];
              if (options.references) { depends.push(options.references.nodel); }

              actions.push({
                actionType: 'changeColumn', tableName, attributeName: df.path[2], options, depends,
              });
              break;
            }
          }

          if (df.path[1] === 'indexes') {
            //                   console.log(df)
            actions.push({
              actionType: 'removeIndex', tableName, fields: df.lhs.fields, options: df.lhs.options, depends: [tableName],
            });
            break;
          }
        }
        break;

        // edit
      case 'E':
        {
          const tableName = df.path[0];
          const depends = [tableName];

          if (df.path[1] === 'schema') {
            // new field attributes
            const options = currentState[tableName].schema[df.path[2]];
            if (options.references) { depends.push(options.references.nodel); }

            actions.push({
              actionType: 'changeColumn', tableName, attributeName: df.path[2], options, depends,
            });
          }
        }
        break;

        // array change indexes
      case 'A':
        {
          console.log('[Not supported] Array model changes! Problems are possible. Please, check result more carefully!');
          console.log('[Not supported] Difference: ');
          console.log(JSON.stringify(df, null, 4));
        }
        break;

      default:
        // code
        break;
    }
  }
  return actions;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

function sortActions(actions) {
  const orderedActionTypes = [
    'removeIndex',
    'removeColumn',
    'dropTable',
    'createTable',
    'addColumn',
    'changeColumn',
    'addIndex',
  ];

  // test
  // actions = shuffleArray(actions);

  actions.sort((a, b) => {
    if (orderedActionTypes.indexOf(a.actionType) < orderedActionTypes.indexOf(b.actionType)) { return -1; }
    if (orderedActionTypes.indexOf(a.actionType) > orderedActionTypes.indexOf(b.actionType)) { return 1; }

    if (a.depends.length === 0 && b.depends.length > 0) { return -1; } // a < b
    if (b.depends.length === 0 && a.depends.length > 0) { return 1; } // b < a

    return 0;
  });

  for (let k = 0; k <= actions.length; k++) {
    for (let i = 0; i < actions.length; i++) {
      if (!actions[i].depends) { continue; }
      if (actions[i].depends.length === 0) { continue; }

      const a = actions[i];

      for (let j = 0; j < actions.length; j++) {
        if (!actions[j].depends) { continue; }
        if (actions[j].depends.length === 0) { continue; }

        const b = actions[j];

        if (a.actionType != b.actionType) { continue; }

        if (b.depends.indexOf(a.tableName) !== -1 && i > j) {
          const c = actions[i];
          actions[i] = actions[j];
          actions[j] = c;
        }
      }
    }
  }
}

function getMigration(actions) {
  const propertyToStr = (obj) => {
    const vals = [];
    for (const k in obj) {
      if (k === 'seqType') {
        vals.push(`"type": ${obj[k]}`);
        continue;
      }

      if (k === 'defaultValue') {
        if (obj[k].internal) {
          vals.push(`"defaultValue": ${obj[k].value}`);
          continue;
        }
        if (obj[k].notSupported) { continue; }

        const x = {};
        x[k] = obj[k].value;
        vals.push(JSON.stringify(x).slice(1, -1));
        continue;
      }

      const x = {};
      x[k] = obj[k];
      vals.push(JSON.stringify(x).slice(1, -1));
    }

    return `{ ${vals.reverse().join(', ')} }`;
  };

  const getAttributes = (attrs) => {
    const ret = [];
    for (const attrName in attrs) {
      ret.push(`      "${attrName}": ${propertyToStr(attrs[attrName])}`);
    }
    return ` { \n${ret.join(', \n')}\n     }`;
  };

  const commandsUp = [];
  const consoleOut = [];

  for (const _i in actions) {
    const action = actions[_i];
    switch (action.actionType) {
      case 'createTable':
        {
          const resUp = `{ fn: "createTable", params: [
    "${action.tableName}",
    ${getAttributes(action.attributes)},
    ${JSON.stringify(action.options)}
] }`;
          commandsUp.push(resUp);

          consoleOut.push(`createTable "${action.tableName}", deps: [${action.depends.join(', ')}]`);
        }
        break;

      case 'dropTable':
        {
          const res = `{ fn: "dropTable", params: ["${action.tableName}"] }`;
          commandsUp.push(res);

          consoleOut.push(`dropTable "${action.tableName}"`);
        }
        break;

      case 'addColumn':
        {
          const resUp = `{ fn: "addColumn", params: [
    "${action.tableName}",
    "${action.attributeName}",
    ${propertyToStr(action.options)}
] }`;

          commandsUp.push(resUp);

          consoleOut.push(`addColumn "${action.attributeName}" to table "${action.tableName}"`);
        }
        break;

      case 'removeColumn':
        {
          const res = `{ fn: "removeColumn", params: ["${action.tableName}", "${action.columnName}"] }`;
          commandsUp.push(res);

          consoleOut.push(`removeColumn "${action.columnName}" from table "${action.tableName}"`);
        }
        break;

      case 'changeColumn':
        {
          const res = `{ fn: "changeColumn", params: [
    "${action.tableName}",
    "${action.attributeName}",
    ${propertyToStr(action.options)}
] }`;
          commandsUp.push(res);

          consoleOut.push(`changeColumn "${action.attributeName}" on table "${action.tableName}"`);
        }
        break;

      case 'addIndex':
        {
          const res = `{ fn: "addIndex", params: [
    "${action.tableName}",
    ${JSON.stringify(action.fields)},
    ${JSON.stringify(action.options)}
] }`;
          commandsUp.push(res);

          const nameOrAttrs = (action.options && action.options.indexName && action.options.indexName != '')
            ? `"${action.options.indexName}"`
            : JSON.stringify(action.fields);
          consoleOut.push(`addIndex ${nameOrAttrs} to table "${action.tableName}"`);
        }
        break;

      case 'removeIndex':
      {
        //               console.log(action)
        const nameOrAttrs = (action.options && action.options.indexName && action.options.indexName != '')
          ? `"${action.options.indexName}"`
          : JSON.stringify(action.fields);

        const res = `{ fn: "removeIndex", params: [
    "${action.tableName}",
    ${nameOrAttrs}
] }`;
        commandsUp.push(res);

        consoleOut.push(`removeIndex ${nameOrAttrs} from table "${action.tableName}"`);
      }

      default:
        // code
    }
  }

  return { commandsUp, consoleOut };
}

function pruneOldMigFiles(revision, migrationsDir, options) {
  // if old files can't be deleted, we won't stop the execution
  return new Promise((resolve) => {
    if (options['keep-files']) resolve(false);
    else {
      fs.readdir(migrationsDir, (err, files) => {
        if (err) {
          if (options.debug) console.error(`Can't read dir: ${err}`);
          resolve(false);
        } else if (files.length === 0) resolve(false);
        else {
          let i = 0;
          files.forEach((file) => {
            i += 1;
            if (file.split('-')[0] === revision.toString()) {
              fs.unlink(`${migrationsDir}/${file}`, (error) => {
                if (error) {
                  if (options.debug) console.log(`Failed to delete mig file: ${error}`);
                  resolve(false);
                } else {
                  if (options.verbose) console.log(`Successfully deleted ${file}`);
                  resolve(true);
                }
              });
            }
            if (i === files.length) resolve(false);
          });
        }
      });
    }
  });
}

function writeMigration(revision, migration, migrationsDir, name = '', comment = '') {
  let commands = `var migrationCommands = [ \n${migration.commandsUp.join(', \n')} \n];\n`;
  let commandsDown = `var rollbackCommands = [ \n${migration.commandsDown.join(', \n')} \n];\n`;

  const actions = ` * ${migration.consoleOut.join('\n * ')}`;

  commands = beautify(commands);
  commandsDown = beautify(commandsDown);

  const info = {
    revision,
    name,
    created: new Date(),
    comment,
  };

  const template = `'use strict';

var Sequelize = require('sequelize');

/**
 * Actions summary:
 *
${actions}
 *
 **/

var info = ${JSON.stringify(info, null, 4)};

${commands}

${commandsDown}

module.exports = {
    pos: 0,
    up: function(queryInterface, Sequelize)
    {
        var index = this.pos;
        return new Promise(function(resolve, reject) {
            function next() {
                if (index < migrationCommands.length)
                {
                    let command = migrationCommands[index];
                    console.log("[#"+index+"] execute: " + command.fn);
                    index++;
                    queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
                }
                else
                    resolve();
            }
            next();
        });
    },
    down: function(queryInterface, Sequelize)
    {
        var index = this.pos;
        return new Promise(function(resolve, reject) {
            function next() {
                if (index < rollbackCommands.length)
                {
                    let command = rollbackCommands[index];
                    console.log("[#"+index+"] execute: " + command.fn);
                    index++;
                    queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
                }
                else
                    resolve();
            }
            next();
        });
    },
    info: info
};
`;

  const filename = path.join(migrationsDir, `${`${revision}`.padStart(5, '0') + (
    (name !== '')
      ? `-${name.replace(/[\s-]/g, '_')}`
      : '')}.js`);

  fs.writeFileSync(filename, template);

  return { filename, info };
}

module.exports = {
  writeMigration,
  getMigration,
  sortActions,
  parseDifference,
  reverseModels,
  pruneOldMigFiles,
};
