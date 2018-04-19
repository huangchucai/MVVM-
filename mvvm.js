// 收集依赖肯定不止一次运用，所以我们调用一个构造函数来创建对象
function Dep() {
  this.subs = []  // 存放所以运用到name的依赖
}
// 添加依赖
Dep.prototype.addDep = function (sub) {
  this.subs.push(sub)
}
// 通知依赖，更新dom
Dep.prototype.notify = function (val) {
  this.subs.length && this.subs.forEach(sub => sub.update(val))
}

function Watcher(vm, exp, fn) {
  this.exp = exp
  this.vm = vm
  this.fn = fn // 回调函数，一般是更新dom
  let arrKeys = exp.split('.')
  let val = vm
  Dep.target = this // 收集的依赖对象是watcher
  arrKeys.forEach(key => {
    val = val[key]  // 这里触发了getter, 而getter里面收集依赖
  })
  Dep.target = null
}
// 触发回调函数，通知
Watcher.prototype.update = function (val) {
  this.fn(val)
}


function Mvvm(options = {}) {
  this.$options = options //将所有属性挂载到实例上面, 和vm.$options同步
  let data = this._data = this.$options.data
  // 计算属性执行
  initComputed.call(this)
  // 劫持数据
  observe(data)
  // 数据代理
  for (let key in data) {
    Object.defineProperty(this, key, {
      configurable: true,
      get() {
        return this._data[key]
      },
      set(newVal) {
        this._data[key] = newVal //这里调用了data的set
      }
    })
  }
  // 模板编译
  new Complie(this.$options.el, this)
  // 触发mounted
  options.mounted.call(this); // 这就实现了mounted钩子函数
}

function observe(data) {
  // 不是对象或者不存在
  if (!data || typeof data !== 'object') {
    return
  }
  new Observe(data)
}

function Observe(data) {
  // 对data的每一个属性进行监听
  for (let key in data) {
    let dep = new Dep() //生成依赖收集
    let val = data[key]
    observe(val) //深度查找对象
    Object.defineProperty(data, key, {
      configurable: true,
      get() {
        // 收集watcher
        Dep.target && dep.addDep(Dep.target)
        return val
      },
      set(newVal) {
        if (val === newVal) {
          return
        }
        val = newVal
        observe(newVal) //设置了新值也需要监听
        dep.notify(newVal) //通知数据更新了
      }
    })

  }
}

// 模板编译
function Complie(el, vm) {
  // 获取dom元素
  vm.$el = document.querySelector(el)
  // https://blog.csdn.net/u012657197/article/details/76205901
  // const fragment = document.createElement('fragment')  
  const fragment = document.createDocumentFragment() //创建一个fragment片段存放dom
  while (child = vm.$el.firstChild) {
    fragment.appendChild(child)
  }
  function replace(frag) {
    Array.from(frag.childNodes).map(node => {
      let txt = node.textContent
      let reg = /\{\{(.*)?\}\}/g
      if (node.nodeType === 3 && reg.test(txt)) { // 有文本同时又包含了{{}}
        console.log(RegExp.$1)  // info.name, title
        let val = vm
        let arrKeys = RegExp.$1.split('.')  // [info, name]
        arrKeys.map(key => {
          val = val[key]
        }) // this[info][name]
        new Watcher(vm, RegExp.$1, (newVal) => {
          node.textContent = txt.replace(reg, newVal)
        })

        node.textContent = txt.replace(reg, val)
      }
      // 元素节点
      if (node.nodeType === 1) {
        let nodeAttr = node.attributes // 获去所有的属性值  
        console.log(nodeAttr)  // {0: type, 1: v-model} 类数组对象
        if (nodeAttr.length) {
          Array.from(nodeAttr).forEach((attr) => {
            let name = attr.name // v-model
            let exp = attr.value // info.age
            if (name.includes('v-')) {
              let val = vm
              exp.split('.').map(key => {
                val = val[key]  // this[info][age]
              })
              node.value = val
            }
            // 监听变化
            new Watcher(vm, exp, (newVal) => {
              node.value = newVal
            })
            // 双向绑定
            node.addEventListener('input', (e) => {
              vm[exp] = e.target.value
            })
          })

        }
      }
      if (node.childNodes && node.childNodes.length) {
        replace(node)
      }
    })
  }
  replace(fragment)
  vm.$el.appendChild(fragment)
}

function initComputed() {
  let computed = this.$options.computed
  let arrKeys = Object.keys(computed)  // [oldAag, youngAge]
  arrKeys.map(key => {
    Object.defineProperty(this, key, {
      configurable: true,
      get: typeof computed[key] === 'function' ? computed[key] : computed[key].get
    })
  })
}


// 老哥们，之前遇到一个面试题，比较两个对象数组，比如
// let a = [ {'id': 1, 'name': 'jake' }, {'id':4, 'name': 'jenny'} ]
// let b = [ {'id': 1, 'name': 'jake' }, {'id': 9, 'name': 'nick'} ]
// 然后取 A 和 B 不相同的那个集合 ，这个有啥思路没

