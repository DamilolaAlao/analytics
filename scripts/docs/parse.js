const fs = require('fs')
const path = require('path')
const jsdoc2md = require('jsdoc-to-markdown')
const { inspect, promisify } = require('util')
const { Parser } = require('acorn')
const readFile = promisify(fs.readFile)

/*
const codePath = path.resolve(__dirname, 'code.js')
getPluginInfo(codePath).then((d) => {
  console.log(d)
}).catch((e) => {
  console.log('e', e)
})
*/

// const docBlocs = dox.parseComments(code, { raw: true, skipSingleStar: true })
// // console.log('docBlocs', docBlocs)
// deepLog(docBlocs)

async function getPluginInfo(filePath) {
  const code = await readFile(filePath, 'utf-8')
  let jsDocData
  let ast
  try {
    jsDocData = await getJSDocInfo(filePath)
    ast = parseCode(code)
  } catch (err) {
    console.log('err', err)
  }
  return {
    ast: ast,
    jsdoc: jsDocData
  }
}

async function getJSDocInfo(codePath) {
  const data = await jsdoc2md.getTemplateData({
    files: [ codePath ],
    json: true
  })
  return data
}

function parseCode(code) {
  let ast
  try {
    // Parse node code
    ast = Parser.parse(code)
  } catch (err) {
    // on fail, try module
    ast = Parser.parse(code, {
      sourceType: 'module'
    })
  }
  // console.log(ast)

  const foundExports = getExports(ast.body)
  // console.log('foundExports', foundExports)

  const mainFunction = foundExports.find(exportedThings => exportedThings.isDefault)
  // console.log('mainFunction', mainFunction)

  const methods = getMethodsReturned(ast.body, mainFunction.name)
  const methodsAndValues = methods.map((x) => {
    return {
      name: x.key.name,
      type: x.value.type,
      value: code.substring(x.value.start, x.value.end)
    }
  })
  const methodsByName = methods.map((prop) => prop.key.name)
  // console.log('methodsByName', methodsByName)
  // console.log('methodsAndValues', methodsAndValues)
  return {
    methodsByName: methodsByName,
    methodsAndValues: methodsAndValues
  }
}

function getMethodsReturned(body, name) {
  // First try to find function that === main export
  const methodsExposed = getFunctionDetails(body, name)
  if (methodsExposed && methodsExposed.length) {
    return methodsExposed
  }
  // Then try to find variable declaration as fallback
  return getVariableDetails(body, name)
}

function getExports(body) {
  return body.filter((node) => {
    return (node.type === 'ExpressionStatement' ||
            node.type === 'ExportDefaultDeclaration') // || node.type === 'ExportNamedDeclaration')
  }).map((node) => {
    // console.log('node', node)
    // ES6 default export
    if (node.type === 'ExportDefaultDeclaration') {
      console.log('node', node)
      const { declaration } = node
      const name = declaration.name || declaration.id.name
      return {
        isDefault: true,
        name: name,
        statement: `export default ${name}`
      }
    }
    // ES6 named export
    if (node.type === 'ExportNamedDeclaration') {
      const { declaration } = node
      // Todo add support
    }

    const { left, right } = node.expression
    const leftValue = resolveLeft(left)
    const rightValue = resolveRight(right)
    // Check if main export
    const isDefault = leftValue === 'module.exports'
    return {
      isDefault: isDefault,
      name: rightValue,
      statement: `${leftValue} = ${rightValue}`
    }
  })
}

function getReturnStatment(body) {
  return body.filter((node) => {
    return node.type === 'ReturnStatement'
  }).reduce((acc, node) => {
    const { argument } = node
    // console.log('argument', argument)
    if (argument && argument.properties) {
      acc = acc.concat(argument.properties)
    }
    return acc
  }, [])
}

function getName(node) {
  if (node.type === 'ExportDefaultDeclaration') {
    return node.declaration.name || node.declaration.id.name
  }
  if (node.type === 'Identifier') {
    return node.name
  }
  return node && node.id && node.id.name
}

function getVariableDetails(body, variableName) {
  return body.filter((node) => {
    if (node.type === 'VariableDeclaration') {
      return true
    }
    return false
  }).reduce((acc, node) => {
    const { declarations } = node
    // console.log('declarations', declarations)
    if (declarations) {
      declarations.forEach((dec) => {
        if (getName(dec) === variableName) {
          if (dec.init && dec.init.properties) {
            acc = acc.concat(dec.init.properties)
          }
        }
      })
    }
    return acc
  }, [])
}

function getFunctionDetails(body, functionName) {
  return body.filter((node) => {
    // console.log('getFunctionDetails', node)
    if (node.type === 'FunctionDeclaration' || node.type === 'ExportDefaultDeclaration') {
      return getName(node) === functionName
    }
    return false
  }).reduce((acc, node) => {
    const body = getBody(node)
    if (body) {
      const lookupBody = body.body || body // verify this logic
      const foundThings = getReturnStatment(lookupBody)
      acc = acc.concat(foundThings)
    }
    return acc
  }, [])
}

function getBody(node) {
  if (node.type === 'ExportDefaultDeclaration') {
    return node.declaration.body
  }
  return node.body
}

function resolveRight(node) {
  if (node.type === 'Literal') {
    return node.raw
  }
  if (node.type === 'FunctionExpression') {
    return getName(node)
  }
  return node.name
}

function resolveLeft(node) {
  if (node.type === 'MemberExpression') {
    let objectName = getName(node.object)
    if (!objectName) {
      objectName = resolveLeft(node.object)
    }
    const propertyName = getName(node.property)
    return `${objectName}.${propertyName}`
  }
  return getName(node)
}

function deepLog(data) {
  console.log(inspect(data, {showHidden: false, depth: null, colors: true}))
}

module.exports = getPluginInfo
