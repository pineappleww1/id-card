// ============================================================
//  想改卡片上的字、颜色、给朋友做一张 —— 只改这个文件就行。
//
//  每个人是下面 people 里的一条。用网址最后的 ?p=xxx 切换：
//    http://localhost:5173/            → 显示第一个人
//    http://localhost:5173/?p=friend   → 显示 id 是 friend 的那个人
//  想给朋友做一张：把下面整条 { ... } 复制一份，改掉 id 和里面的字。
//
//  下面的内容全是占位示例，换成你和朋友自己的。
//  这里写的是"默认值"：在网页右侧工具栏里改过的内容会存在浏览器里，
//  优先显示那份；点工具栏里的「恢复默认」就会回到这里写的样子。
// ============================================================

export const people = [
  {
    id: 'me',

    // 卡片上的名字：第一行黑色，第二行用 accent 颜色。页面底部的大字会自动用这两行拼起来
    line1: 'Your',
    line2: 'Name',
    accent: '#1f2bff',

    // 左上角、右上角的小字（\n 是换行）
    topLeft: 'I make small things and\nshare them with friends.',
    moreLink: '', // [more] 点了跳去哪；留空就不显示 [more]
    topRight: 'Currently building\nsomething fun',

    // 卡片下半部分
    currentlyLabel: 'Currently',
    currently: 'Making toys on the web',
    previouslyLabel: 'Previously',
    tags: [
      { text: 'Tag One', color: '#141414' },
      { text: 'Tag Two', color: '#d5141e' },
      { text: 'Tag Three', color: '#3b1fd6' },
    ],

    // 背面「一句话」模板里的那句话（双击卡片会转一圈，能看到背面）
    back: 'Hello :)',

    // 明信片上的一句话
    postcard: 'Wish you were here.',

    // 卡套里的三页：正面、中间明信片、背面。
    // template 是用哪个预设模板（可选的见 card-texture.js 里的 TEMPLATES），bg 是底色
    pages: {
      front: { template: 'classic', bg: '#f5f5f3' },
      postcard: { template: 'postcard', bg: '#efe8d8' },
      back: { template: 'message', bg: '#f5f5f3' },
    },
  },
];

// 整体手感（一般不用动）
export const feel = {
  marqueeSecondsPerName: 0, // 0 = 底部大字固定不动、自动铺满屏幕宽；想让它滚动就填秒数，比如 9
  strapColor: '#1c1c1c',    // 挂绳颜色
  gravity: 24,              // 重力：越大卡片越"沉"、甩得越快
};
