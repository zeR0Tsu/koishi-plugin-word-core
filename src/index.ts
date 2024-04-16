import { Context, Logger, Schema, h } from 'koishi';
import { word } from './src/word';
import { resolve } from 'path';
import { } from '@koishijs/plugin-console';
// import { } from '@koishijs/plugin-notifier';

import * as core from './src/index';

export const name = 'word-core';

export * from './src/word';

export interface Config {
  masterID: string[];
  searchEndpoint: string;
}

export const inject = {
  // required: ['database', 'console', 'notifier']
  required: ['database', 'console']
};

export const Config: Schema<Config> = Schema.object({
  masterID: Schema.array(String).description('管理员的唯一标识'),
  searchEndpoint: Schema.string().description('词库插件市场后端地址').default('https://wplugin.reifuu.icu')
});

export const logger = new Logger('Word-core');

// TypeScript 用户需要进行类型合并
export const apply = async (ctx: Context, config: Config) => {
  ctx.plugin(core);
  ctx.plugin(word, { searchEndpoint: config.searchEndpoint });

  ctx.inject(['word'], async ctx => {
    ctx.command('word', '词库核心！');

    ctx.command('word', '词库核心！').subcommand('.add <question:string> <answer:string>', '为一个触发词添加回复').usage('添加一个词库')
      .example('word.add 你好 你也好')
      .action(async ({ session }, question, answer) => {
        if (!session) { return; }
        if (!question) { return `<at name="${session.username}" /> 你没有设置触发词`; }
        if (!answer) { return `<at name="${session.username}" /> 你没有设置回答`; }

        const uid = session.userId;

        const nowWordDB = await ctx.word.user.getEditWord(uid);

        const hasPermission = await ctx.word.permission.isHave(uid, `word.edit.${nowWordDB}`);

        if (!hasPermission && !config.masterID.includes(uid)) { return `<at name="${session.username}" /> 你没有词库【${nowWordDB}】的编辑权限`; }

        const a = await ctx.word.editor.addWordItem(nowWordDB, uid, question, answer);

        if (typeof a === 'number') {
          return `<at name="${session.username}" /> 添加到【${nowWordDB}】词库成功，序号为【${a}】`;
        } else {
          return a;
        }
      });

    ctx.command('word', '词库核心！').subcommand('.rm <question:string> <listNumber:text>', '删除触发词的回复').usage('序号为数字或者all')
      .example('word.rm 你好 all')
      .example('word.rm 你好 1')
      .action(async ({ session }, question, whichTemp) => {
        if (!session) { return; }
        if (!question) { return `<at name="${session.username}" /> 你没有设置触发词`; }
        if (!/^\d+$|^all$/.test(whichTemp)) { return `<at name="${session.username}" /> 你没有设置需要被删除的序号或序号不正确`; }

        const uid = session.userId;
        const which = (whichTemp === 'all') ? 'all' : Number(whichTemp);

        const nowWordDB = await ctx.word.user.getEditWord(uid);
        const hasPermission = await ctx.word.permission.isHave(uid, `word.edit.${nowWordDB}`);

        if (!hasPermission && !config.masterID.includes(uid)) { return `<at name="${session.username}" /> 你没有词库【${nowWordDB}】的编辑权限`; }

        const a = await ctx.word.editor.rmWordItem(nowWordDB, uid, question, which);

        if (a === 'over') {
          return `<at name="${session.username}" /> 删除触发词成功`;
        } else {
          return `<at name="${session.username}" /> ${a}`;
        }
      });

    ctx.command('word', '词库核心！').subcommand('.setedit <dbname:text>', '选择库进行编辑').usage('当setedit后不加参数则代表选择为默认库')
      .example('word.setedit 测试')
      .action(async ({ session }, test) => {
        if (!session) { return; }
        let newDB = test;
        if (!test) { newDB = 'default'; }
        const uid = session.userId;

        const a = await ctx.word.user.setEditWord(uid, newDB);
        if (a) {
          return `<at name="${session.username}" /> 设置成功`;
        } else {
          return `<at name="${session.username}" /> 设置失败`;
        }
      });

    ctx.command('word', '词库核心！').subcommand('.readedit', '查看当前正在编辑的词库')
      .example('word.readedit')
      .action(async ({ session }) => {
        if (!session) { return; }
        const uid = session.userId;

        const a = await ctx.word.user.getEditWord(uid);

        return `<at name="${session.username}" /> 你正在编辑【${a}】`;
      });

    ctx.command('word', '词库核心！').subcommand('.find <question:text>', '寻找某个触发词所在的词库')
      .example('word.find 你好')
      .action(async ({ session }, question) => {
        if (!session) { return; }
        const a = await ctx.word.editor.getQuestion(question);

        let outMsg = '';
        a.forEach((value, index) => {
          outMsg = outMsg + `\n${index + 1}. ${value}`;
        });

        return `<at name="${session.username}" /> 此关键词存在以下词库：` + h.text(outMsg);
      });

    ctx.command('word', '词库核心！').subcommand('.get <question:text>', '查看当前词库某触发词的所有回答')
      .example('word.get 测试')
      .action(async ({ session }, question) => {
        if (!session) { return; }
        if (!question) { return `<at name="${session.username}" /> 你没有输入需要查询的关键词`; }
        const nowDB = await ctx.word.user.getEditWord(session.userId);

        const a = await ctx.word.editor.readWord(nowDB);

        if (!a.data[question]) { return `<at name="${session.username}" /> 当前编辑词库没有此触发词`; }

        let outMsg = `<at name="${session.username}" /> 此关键词含有以下回答：`;
        a.data[question].forEach((value, index) => {
          outMsg = outMsg + `\n${index + 1}. ${value}`;
        });

        return h.text(outMsg);
      });

    // 获取此词库所拥有的触发词
    ctx.command('word', '词库核心！').subcommand('.getDB <dbName:text>', '查看当前/某词库某触发词的所有回答')
      .example('word.getDB 测试')
      .example('word.getDB')
      .action(async ({ session }, dbName) => {
        if (!session) { return; }
        dbName = (dbName) ? dbName : await ctx.word.user.getEditWord(session.userId);

        const a = await ctx.word.editor.readWord(dbName);
        const questionList = Object.keys(a.data);

        let outMsg = `<at name="${session.username}" /> 你当前编辑的库含有以下触发词：`;
        questionList.forEach((value, index) => {
          outMsg = outMsg + `\n${index + 1}. ${value}`;
        });

        return h.text(outMsg);
      });

    // 设置存储格子
    ctx.command('word', '词库核心！').subcommand('.setsave <cell:text>', '设置当前词库的存储格子')
      .example('word.setsave 存储格1')
      .action(async ({ session }, cell) => {
        if (!session) { return; }
        if (!cell) { return `<at name="${session.username}" /> 你没有输入存储格子名称`; }

        const uid = session.userId;

        const nowWordDB = await ctx.word.user.getEditWord(uid);
        const hasPermission = await ctx.word.permission.isHave(uid, `word.edit.${nowWordDB}`);

        if (!hasPermission && !config.masterID.includes(uid)) { return `<at name="${session.username}" /> 你没有词库【${nowWordDB}】的编辑权限`; }

        const a = await ctx.word.editor.setSaveCell(nowWordDB, cell, uid);

        if (typeof a === 'boolean') {
          return `<at name="${session.username}" /> 修改成功`;
        } else {
          return `<at name="${session.username}" /> ${a}`;
        }
      });

    // 恢复默认存储格子
    ctx.command('word', '词库核心！').subcommand('.resetsave', '重置当前词库的存储格子')
      .example('word.resetsave')
      .action(async ({ session }) => {
        if (!session) { return; }

        const uid = session.userId;

        const nowWordDB = await ctx.word.user.getEditWord(uid);
        const hasPermission = await ctx.word.permission.isHave(uid, `word.edit.${nowWordDB}`);

        if (!hasPermission && !config.masterID.includes(uid)) { return `<at name="${session.username}" /> 你没有词库【${nowWordDB}】的编辑权限`; }

        const a = await ctx.word.editor.setSaveCell(nowWordDB, 'default', uid);

        if (typeof a === 'boolean') {
          return `<at name="${session.username}" /> 修改成功`;
        } else {
          return `<at name="${session.username}" /> ${a}`;
        }
      });

    ctx.command('word', '词库核心！').subcommand('.getsave', '查看当前词库的存储格子')
      .example('word.getsave')
      .action(async ({ session }) => {
        if (!session) { return; }

        const uid = session.userId;

        const nowWordDB = await ctx.word.user.getEditWord(uid);

        const a = await ctx.word.editor.readSaveCell(nowWordDB, uid);

        return `<at name="${session.username}" /> 当前词库的存储格子为【${a}】`;

      });

    // 设置权限
    ctx.command('word', '词库核心！').subcommand('.addp <uid:string> <permission:text>', '增加权限')
      .usage([
        '权限节点说明：',
        '编辑词库：word.edit.词库名',
        '编辑所有词库：word.edit.*',
        '添加权限：word.admin.add',
        '删除权限：word.admin.rm',
        '管理员级权限：word.admin.*'
      ].join('\n'))
      .example('word.addp 5b0fe8a3b1ff2 word.edit.*')
      .action(async ({ session }, uid, permission) => {
        if (!session) { return; }

        const mid = session.userId;

        const hasPermission = await ctx.word.permission.isHave(mid, 'word.admin.add');

        if (!hasPermission && !config.masterID.includes(mid)) { return `<at name="${session.username}" /> 你没有词库的【添加权限】权限`; }

        const a = await ctx.word.permission.add(uid, permission);
        if (typeof a === 'boolean') {
          return (a) ? `<at name="${session.username}" /> 添加成功` : `<at name="${session.username}" /> 添加失败`;
        } else {
          return `<at name="${session.username}" /> ${a}`;
        }
      });

    // 取消权限
    ctx.command('word', '词库核心！').subcommand('.rmp <uid:string> <permission:text>', '增加权限')
      .usage([
        '权限节点说明：',
        '编辑词库：word.edit.词库名',
        '编辑所有词库：word.edit.*',
        '添加权限：word.admin.add',
        '删除权限：word.admin.rm',
        '管理员级权限：word.admin.*'
      ].join('\n'))
      .example('word.rmp 6503fb7b50308 word.edit.*')
      .action(async ({ session }, uid, permission) => {
        if (!session) { return; }

        const mid = session.userId;

        const hasPermission = await ctx.word.permission.isHave(mid, 'word.admin.rm');
        if (!hasPermission && !config.masterID.includes(mid)) { return `<at name="${session.username}" /> 你没有词库的【删除权限】权限`; }

        const a = await ctx.word.permission.rm(uid, permission);
        if (typeof a === 'boolean') {
          return (a) ? `<at name="${session.username}" /> 添加成功` : `<at name="${session.username}" /> 添加失败`;
        } else {
          return `<at name="${session.username}" /> ${a}`;
        }
      });

    // 新增作者
    ctx.command('word', '词库核心！').subcommand('.addauthor <uid:string>', '设置某uid为作者')
      .example('word.addauthor 6503fb7b50308')
      .action(async ({ session }, uid) => {
        if (!session) { return; }
        const mid = session.userId;

        const nowWordDB = await ctx.word.user.getEditWord(mid);

        const hasPermission = await ctx.word.permission.isHave(uid, `word.edit.${nowWordDB}`);

        if (!hasPermission && !config.masterID.includes(mid)) { return `<at name="${session.username}" /> 你没有词库【${nowWordDB}】的编辑权限`; }

        const a = await ctx.word.editor.addAuthor(nowWordDB, mid, uid);

        return `<at name="${session.username}" /> ${a}`;
      });

    // 减少作者
    ctx.command('word', '词库核心！').subcommand('.rmauthor <uid:string>', '删除某uid的作者权限')
      .example('word.rmauthor 6503fb7b50308')
      .action(async ({ session }, uid) => {
        if (!session) { return; }
        const mid = session.userId;

        const nowWordDB = await ctx.word.user.getEditWord(mid);
        const hasPermission = await ctx.word.permission.isHave(uid, `word.edit.${nowWordDB}`);

        if (!hasPermission && !config.masterID.includes(mid)) { return `<at name="${session.username}" /> 你没有词库【${nowWordDB}】的编辑权限`; }

        const a = await ctx.word.editor.removeAuthor(nowWordDB, mid, uid);

        return `<at name="${session.username}" /> ${a}`;
      });

    ctx.command('word', '词库核心！').subcommand('.id', '查看自己的id及名字')
      .example('word.id')
      .action(({ session }) => {

        if (!session) { return '发生异常'; }

        return `您的名字是：【${session.username}】，您的id是：【${session.userId}】`;
      });

    ctx.on('message', async (session) => {
      if (!session.content) { return; }

      if (session.userId == session.bot.user.id || session.userId == session.bot.selfId) { return; }
      const atBot = `<at id="${session.bot.selfId}"/> `
      if (session.content.startsWith(atBot)) { session.content = session.content.replace(atBot, '') }

      const msg = await ctx.word.driver.start(session);
      if (!msg) { return; }
      // console.log(msg)
      session.send(msg);
    });

    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    });

    // 上传
    // ctx.word.editor.updateCloudWord({
    //   tag: [],
    //   author: 'word-core',
    //   name: '测试项目',
    //   wiki: '',
    //   authorId: 'BSTluo',
    //   dbName: 'default',
    //   descriptor: '这是一个测试项目',
    //   version: '0.0.1',
    //   icon: 'games'
    // })

    setInterval(async () => {
      try {
        // 这个接口只是给我看看！有多少人使用的！下面那个是查看使用人数的
        await fetch(`https://xc.null.red:8043/api/online/heartbeat?t=word_core&_=${Date.now()}`);

        // const temp = await fetch(`https://xc.null.red:8043/api/online/list?t=word_core&_=${Date.now()}`)
        // const data = await temp.json()
        // const hasUser = data.online
        // console.log(data)
      } catch (err) {
        return `获取在线人数失败，请检查网络是否通畅，也可能是服务器挂掉了`;
      }
    }, 2 * 60 * 1000);

    // const notifier = ctx.notifier.create();
    // const newNotifier = async (str: string) => {
    //   notifier.update(str);
    //   await ctx.sleep(5000);
    //   notifier.dispose();
    // };
    // 下载
    ctx.console.addListener('getWord', async (name) => {
      const a = await ctx.word.editor.getCloudWord(name);
      // newNotifier(a);
      return a;
    });

    // 卸载
    ctx.console.addListener('rmWord', async (name) => {
      const a = await ctx.word.editor.removeWord(name);
      // newNotifier(a);
      return a;
    });

    ctx.console.addListener('getPluginServerUrl', () => {
      return ctx.word.tools.url;
    });
  });
};

declare module '@koishijs/plugin-console' {
  interface Events {
    'rmWord'(name: string): Promise<"ok" | "词库列表不存在此词库">;
    'getWord'(name: string): Promise<"获取的插件格式异常" | "词库已存在，无法安装" | "ok">;
    'getPluginServerUrl'(): string;
  }
}

// ...o/......@OoOO........=@@@*****..........................***@@^.......[\/.....
// ..,@^....*//oOo^........@@@@*****.........................***=@@^...............
// ..O@.....=@oOoo.......,@@O@O*****........................****@@@@...............
// .=O^....,@\OOo^.......@@Oo@^******.......................***=@@@@^..............
// ,O@.....@OoOOo......=@@^=o@^******......................****@@/@@O`.............
// /O^....=@OOOo/....//@@`.=O@^****o**....................****=@@oO@@o`............
// o@.....@oOooo^.../O@^....O@\oooo^,**..................=****@@OOo@@^O^...........
// O@....=OoOooo.../@@@^....o@ooooooo*=*......^.........=*`**=@@^,oo@@OoO..........
// @O....@oOOOO/.,@@@@@.....=@Ooooooooo\*.....^^*......=\o``*O@O..=oO@@oOO`........
// @^...=@OOoooO@@@@@@@`....=@Oooooooooo\*...*\oo\`...,/o*^\/@@`...\oO@@OOO\.......
// @^...@OO/O@@@@@@@@@@@@@]..=@ooooooooooo``.=^oooooooooooooO@^.....\@O@OoOOO`.....
// @....@O@@@@@/[......,\@@@@@@ooooooooooooooooooooooooooooO@/`...../@@O@OoOOO\...=
// ^...=@@@@/..............@@@@@o\ooooooooooooooooooooooooO@@`......@@@OO@OOOOOOOOO
// ^.../@@@`................=@@@\/ooooooooooooooooooooooooO@o......=@@@@oO@OOOOOOOO
// ^...@@@...................=@@@ooooooooooooooooooooooooo@\.,/@@@@@@@@@@@@@OOOOOOO
// @..=@@^....................@@@\ooooooooooooooooooooooo/@/@@@@@@@/[[O@@@@@@@@OOOO
// @..@@@^....................@@@@\oo\[\ooooooooooooooo/]@@@@@@[............[O@@@OO
// @^.@@@^...................=@@@@@\o=`\\/\oooooooooooo,@@@@/..................\@@@
// @@`\@@@...................@@@@..[[@/...,[\@@OOooOo/O@@@@^....................=@@
// @/@`@@@\................,@@@@....................[[`/@@/......................\@
// @^.\\\@@@]............]@@@@........................=@@@^......................=@
// @`...[O\@@@@@\]]]]/@@@@@@`.........................=@@@^......................=@
// .......,^,\@@@@@@@@@@@[............................,@@@^....................../@
// .../@/...,`.........................................=@@@`....................=@@
// ../@^.../@..,@/......................................=@@@`................../@@@
// .=O`...@/..=@^........................................,@@@\...............,@@@@^
// ...........,............................................,@@@@`........../@@@@@`.
// ..........................................................*\@@@@@@@@@@@@@@[`.,/.
// ..............................................................\@@@@@/[[..,]@@/..
// .............................]]]]O@@@@@@@@@O]]]]`...............O@`./@]@@\//....
// ...........................=@OO[[[[*********,[[[O@@@..........=@[.,@@*.,O/......
// `........................./@[`*******************=@@^]]......,/`..O/..=O`...../@
// @`........................@@^*********************O@@@@@`.........,/`......./@O@
// @@\.......................\@\*************************=@^......../`......,//=@/`
// OO@@\`.....................O@^**********************``=@^......,/.....,@/.,@@`..
// @OOO@@@\.......................*********************,/@/....../`....O/..//@/....
// @@@@@@@@@@@@@@@@]]]]]..............*****************=@/......O`..*/@`,/o@@......
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@\]`............................/`../O@OOoo@^.......
// O@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\`.......................O..=O@/OOO@`........
