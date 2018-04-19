# 手动实现MVVM的原理以及双向绑定

![Vue双向绑定](https://github.com/huangchucai/MVVM-/blob/master/Vue%E5%8F%8C%E5%90%91%E7%BB%91%E5%AE%9A.jpg)

### 前言

博主在最近之前的面试中，被问得最多就是Vue双向绑定的原理，现在面试阶段已经结束了，所以就想手撸一下Vue双向绑定的实现。本文将会包括下面几个大的部分

1. Object.defineProperty()实现数据劫持
2. Dep类收集和通知依赖
3. Watch来监听依赖和通知渲染
4. Compile模板变异
5. 拓展computed计算属性和mounted钩子函数

数据模板

```html
// mvvm.html
<body>
    <div id="app">
        <h1>{{info.name}}</h1>
        <p>{{time}}毕业于{{school}}</p>
        <p>目前从事于{{info.work}}</p>
        希望您喜欢这篇文章--{{title}}
    </div>
    <!--实现的mvvm-->
    <script src="mvvm.js"></script>
    <script>
        // 写法和Vue一样
        let mvvm = new Mvvm({
            el: '#app',
            data: {
                time: '2016年',
                info: {
                    name: 'hcc',
                    work: 'web前端'
                },
                title: 'Vue双向绑定'
            }
        });
    </script>
</body>

```



### 1. 数据劫持

到目前为止，Vue还是通过`Object.defineProperty`来实现数据的劫持，据说之后会升级到Proxy，就是就不用通过Vue.set来添加新的属性，这里不会对Object.defineProperty的基本用法讲解，[详情请看mdn](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)。

#### 1.1 为什么要数据劫持

我们都知道Vue是基于数据驱动，那我们怎么知道哪些dom用到了哪些数据，数据和dom如何实现双向的更新呢？

```html
<div id="#app">
  <div>{{name}}</div>
  <div>{{val}}</div>
</div>
```

我们之所以观察数据，目的肯定是当数据变化的时候，我们可以通知哪些使用了这些数据的地方。这里就有2个问题了：

1. 哪些地方使用了这些数据 （通过get来收集依赖）
2. 数据变化的时候更新数据 （通过set来通知变化）

#### 1.2 初始化Mvvm

```javascript
function Mvvm(options = {}) {
  this.$options = options //将所有属性挂载到实例上面, 和vm.$options同步
  let data = this._data = this.$options.data
  // 劫持数据
  observe(data)
}
```

#### 1.3 如何实现

1. 观察data对象，给对象进行Object.defineProperty监听
2. 对于直接新增的对象属性，不存在监听get和set
3. 深度响应 因为每次赋予一个新对象时会给这个新对象增加defineProperty(数据劫持)

使用observe来深度观察数据，Observe来观察数据

```javascript
// 方便递归调用
function observe(data) {
  // 不是对象或者不存在就直接return掉
  // 防止递归溢出
  if (!data || typeof data !== 'object') {
    return
  }
  new Observe(data)
}

//观察数据的主要逻辑
function Observe(data) {
  // 对data的每一个属性进行监听（get, set）
  for (let key in data) {
    let val = data[key]
    observe(val) //深度查找对象
    Object.defineProperty(data, key, {
      configurable: true,
      get() {
        return val
      },
      set(newVal) {
        if (val === newVal) {
          return
        }
        val = newVal
        observe(newVal) //设置了新值也需要监听
      }
    })

  }
}
```

这里会有2个地方存在疑惑，第一个是为什么要深度查找对象，第二个是set的时候为什么又要执行一次observe。

1. 没有深度查看对象的时候，我们发现data里面的对象info就没有被监听

   ![没有深度监听](https://github.com/huangchucai/MVVM-/blob/master/%E6%B2%A1%E6%9C%89%E6%B7%B1%E5%BA%A6%E7%9B%91%E5%90%AC.png)

   当深度检查对象后，我们可以监听到data对象的内部对象，实现更好的数据监听

![observe](https://github.com/huangchucai/MVVM-/blob/master/observe.png)

2. 为什么设置新值后也需要observe

   * 设置了set中的observe后我们可以对数据的改变也做到监听。

   ![深度监听新对象](https://github.com/huangchucai/MVVM-/blob/master/%E6%B7%B1%E5%BA%A6%E7%9B%91%E5%90%AC%E6%96%B0%E5%AF%B9%E8%B1%A1.png)

   * 没有设置的话，我们监听不到新的值

     ![没有深度监听新对象](https://github.com/huangchucai/MVVM-/blob/master/%E6%B2%A1%E6%9C%89%E6%B7%B1%E5%BA%A6%E7%9B%91%E5%90%AC%E6%96%B0%E5%AF%B9%E8%B1%A1.png)

### 2.数据代理

我们知道Vue中，我们可以直接通过this.name拿到data中的数据，而不用通过this._data.name才能拿到数据，这里的数据代理就是让我们少一层。	

```javascript
function Mvvm(options = {}) {
  this.$options = options //将所有属性挂载到实例上面, 和vm.$options同步
  let data = this._data = this.$options.data
  // 劫持数据
  observe(data)
  // 数据代理
 + for (let key in data) {
    Object.defineProperty(this, key, {
      configurable: true,
      get() {
        return this._data[key]
      },
      set(newVal) {
        this._data[key] = newVal //这里调用了data的set
      }
    })
 + }
}
```

到这里我们已经基本完成了数据的劫持和数据的代理，但是页面的效果还没有展示出来，下面我们要通过compile把模板进行简单的编译

### 3.模板编译

看不到效果，你可能有点云里雾里，很多文章到这一步会告诉你要收集依赖，看到效果我们再往后讲，你们可能会更加的理解。也方便之后的调试。

在数据代理和数据劫持后，开始渲染模板，首先我们知道肯定要接收包裹容器的dom，获取示例上面的属性，暂时的接收2个，之后需要再添加

```javascript
function Mvvm(options = {}) {
  this.$options = options //将所有属性挂载到实例上面, 和vm.$options同步
  let data = this._data = this.$options.data
  // 劫持数据
  observe(data)
  // 数据代理
  for (let key in data) {
	...
  }
  // 模板编译
+  new Complie(this.$options.el, this)
}
  
  
function Compile(el, vm) {
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
      let txt = node.textContent //获取文本
      let reg = /\{\{(.*)?\}\}/g
      if (node.nodeType === 3 && reg.test(txt)) { // 有文本同时又包含了{{}}
        console.log(RegExp.$1)  // info.name, title
        let val = vm
        let arrKeys = RegExp.$1.split('.')  // [info, name]
        arrKeys.map(key => {
          val = val[key] 
        }) // this[info][name]
        node.textContent = txt.replace(reg, val)
      }
      // 如果内部还有子节点
      if (node.childNodes && node.childNodes.length) {
        replace(node)
      }
    })
  }
  replace(fragment)
  vm.$el.appendChild(fragment)
}
```

这里我们已经可以看到实际的效果了。但是还是没有完成，数据的变化的时候，dom跟着变化，所以接下来我们要处理发布订阅来收集依赖。

### 4.发布订阅模式

首先要明白为什么需要引入发布订阅的模式，订阅什么？我们的需求是数据发送改变的同时，dom也要相应的更新，所以我们肯定要知道哪些dom中运用到了哪些数据，并把这些依赖收集起来，用于之后变化后通知对应的dom。

#### 4.1收集依赖

```html
<template>
	<div>{{name}}</div>
  	<div>{{name}}</div>
</template>
```

像上述代码中，模板有2个地方运用到了name,当name变化的时候，要将这2处都通知到，那我们从哪里收集依赖呢？

还记得我们模板渲染的代码中有这么一段：

```javascript
// 这里已经触发了getter
arrKeys.map(key => {
  val = val[key] 
}) // this[info][name]
node.textContent = txt.replace(reg, val)
```

每一次的dom渲染数据，肯定是触发了getter来获取我们初始的数据，当数据更新了，肯定是触发了对应属性的setter。所以得出： **getter的时候收集依赖，setter的时候触发依赖**。

```javascript
// 收集依赖肯定不止一次运用，所以我们调用一个构造函数来创建对象
function Dep() {
  this.subs = []  // 存放所以运用到name的依赖
}
// 添加依赖
Dep.prototype.addDep = function(sub) {
	this.subs.push(sub) 
}
// 通知依赖，更新dom
Dep.prototype.notify = function() {
	this.subs.length && this.subs.forEach(sub => sub.update)
}
```

#### 4.2收集谁？？？

订阅我们数据的地方可能有很多处，比如模板，computed，watch,我们不可能对于每一种情况都分别处理，显然，我们需要一个中间者，来帮我们处理不同的情况，它能够做到我们在收集依赖的阶段把这个封装好的类的示例放进去，通知也只通知它一个，它能够帮我们负责通知其他地方。Vue里面取名叫做watcher。

watcher作为一个中间值，数据变化通知watcher，然后watcher通知其他地方。

```javascript
// 类似于这样,一个用于获取新的值的对象  一个数据变化的值，一个回调函数通知变化, 
vm.$watcher(vm, 'info.name' , (newVal, oldVal) =>{
  dosomething...
})


function Watcher(vm, exp, fn) {
  this.exp = exp // 要通知的值
  this.fn = fn // 回调函数，一般是更新dom
}
// 触发回调函数，通知
Watcher.prototype.update = function (newVal) {
  this.fn(newVal)
}
let watcher = new Watcher(() => {console.log(1)})
```

现在我们的需求有变成，怎么在exp这个属性发生改变的时候，触发fn。

#### 4.3数据更新视图

* 现在我们要订阅一个事件，当数据改变需要重新刷新视图，这就需要在replace替换的逻辑里来处理
* 通过new Watcher把数据订阅一下，数据一变就执行改变内容的操作

```javascript
// 首先把watcher加入到Compile中，用来更新数据
// 模板编译
function Complie(el, vm) {
  // 获取dom元素
  vm.$el = document.querySelector(el)
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
        // 添加watcher，监听之后的更新
     +   new Watcher(vm, RegExp.$1, (newVal) => {
     +     node.textContent = txt.replace(reg, newVal)
     +   })
        node.textContent = txt.replace(reg, val) // 初始化更新
        ....
}
                     
// Watch改变为
function Watcher(vm, exp, fn) {
  this.exp = exp
  this.vm = vm
  this.fn = fn // 回调函数，一般是更新dom
  let arrKeys = exp.split('.')
  let val = vm
  Dep.target = this // 收集的依赖对象是watcher
  // 这里只是单纯的想要触发对应的exp的getter，值并没有用除，（可以简化）
  arrKeys.forEach(key => {
    val = val[key]  // 这里触发了getter, 而getter里面收集依赖
  })
  Dep.target = null  // 已经触发了getter，可以清除		
}
```

添加了watcher之后，我们开始处理getter收集依赖，setter更新依赖

```javascript
function Observe(data) {
  // 对data的每一个属性进行监听
  for (let key in data) {
  +  let dep = new Dep() //生成依赖收集
  	 let val = data[key]
     observe(val) //深度查找对象
     Object.defineProperty(data, key, {
      configurable: true,
      get() {
        // 收集watcher
   +    Dep.target && dep.addDep(Dep.target)
        return val
      },
      set(newVal) {
        if (val === newVal) {
          return
        }
        val = newVal
        observe(newVal) //设置了新值也需要监听
   +    dep.notify(newVal) //通知数据更新了
      }
    })
  }
}
```

到这里基本的Mvvm的原理已经完成，有几点的还没有写出来：

1. 监听数组的变化
2. 对于数据的处理，多个{{}}的处理
3. 一些内部数据传递的细节

---

### 5 实现v-model双向绑定

v-model本质上是一个语法糖，原理其实很简单

```javascript
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
```

### 6. 顺带完成computed计算属性和mounted钩子函数

```javascript
function Mvvm(options = {}) {
  this.$options = options //将所有属性挂载到实例上面, 和vm.$options同步
  let data = this._data = this.$options.data
  // 计算属性执行
+  initComputed.call(this)
  // 劫持数据
  observe(data)
  // 数据代理
  ...
  // 模板编译
  new Complie(this.$options.el, this)
  // 触发mounted
+  options.mounted.call(this); // 这就实现了mounted钩子函数
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
```

1. 计算属性值改变的时候还是有问题，需要优化
