import { Context, Session, capitalize } from "koishi";
import { statement, statusMsg } from "../../extend/statement";
import { matchType } from "..";
import { word } from "../../word";
import { settingType, settingTypeValue, wordSaveData } from "../..";

export interface wordDataInputType
{
  username: string;
  userId: string;
  channelId: string;
  content: string;
}

type parTemp = {
  // item:{userid:{saveDB:{itemName:number}}}
  item: Record<string, Record<string, Record<string, number>>>,
  userConfig: Record<string, settingType>;
};

export const saveItemDataTemp: Record<string, parTemp> = {};

// 切换一个词条进行解释（不会切换到已解析的词条）
// data为返回的值
type typeNext = (data?: string) => {
  status: 'next';
  data: string | undefined;
};

const next: typeNext = (data?: string) =>
{
  return { status: 'next', data: data };
};

// 杀死此回复词
// data为返回的值
type typeEnd = (data?: string) => {
  status: 'end';
  data: string | undefined;
};

const end: typeEnd = (data?: string) =>
{
  return { status: 'end', data: data };
};

// 结束此回复词
// data为返回的值
type typeKill = (data?: string) => {
  status: 'kill';
  data: string | undefined;
};

const kill: typeKill = (data?: string) =>
{
  return { status: 'kill', data: data };
};

// 词库切换函数
type typeParPack = {
  next: typeNext;
  end: typeEnd;
  kill: typeKill;
};

const parPack: typeParPack = {
  next: next,
  end: end,
  kill: kill
};

let funcPackKeys = Object.keys(statement);

export const parsStart = async (questionList: string, wordData: wordSaveData, word: word, session: Session | wordDataInputType, matchList?: matchType): Promise<{ data: any, message: string; } | null> =>
{

  funcPackKeys = Object.keys(statement);

  // 先将文本拆解为树
  // 你(+:xx:xx)好
  // [你,[+,xx,xx],好]
  const tree = getTree(questionList);
  // console.log(tree);

  if (!session.content) { return null; }

  const msg = [];
  let userData = {};
  let oldUserData = {};

  for (let needParMsg of tree)
  {
    let over;
    if (Array.isArray(needParMsg))
    {
      over = await parseTrees(word, needParMsg, session, wordData, !matchList ? {} : matchList, JSON.parse(JSON.stringify(userData)));

      if (over)
      {
        msg.push(over.message);
        oldUserData = userData;
        userData = over.data;
      } else
      {
        userData = oldUserData;
      }
    } else
    {
      msg.push(needParMsg);
    }
  }

  const msgOut = msg.join('');
  if (msgOut)
  {
    return { message: msgOut, data: userData };
  } else
  {
    return null;
  }
};

const getTree = (str: string): any[] =>
{
  let parseStr = str;

  const par = () =>
  {
    let tempArr: any[] = [];
    let index = 0;

    while (parseStr.length > 0)
    {

      const v = parseStr[0];
      parseStr = parseStr.slice(1);

      if (v == '(')
      {
        if (!tempArr[index]) { tempArr[index] = []; }
        tempArr[index].push(par());
      } else if (v == ')')
      {
        return tempArr;
      } else if (v == ':')
      {
        if (!tempArr[index]) { tempArr[index] = ['']; }
        const length = tempArr[index].length;

        if (Array.isArray(tempArr[index][length - 1]))
        {
          index++;
        } else if (tempArr[index][length - 1].endsWith('http') || tempArr[index][length - 1].endsWith('https'))
        {

          if (Array.isArray(tempArr[index][length - 1]))
          {
            tempArr[index].push(v);
          } else
          {
            tempArr[index][length - 1] += v;
          }
        } else
        {
          index++;
        }
      } else
      {
        if (!tempArr[index]) { tempArr[index] = ['']; }
        const length = tempArr[index].length;
        if (Array.isArray(tempArr[index][length - 1]))
        {
          tempArr[index].push(v);
        } else
        {
          tempArr[index][length - 1] += v;
        }
      }
    }

    return tempArr;
  };

  const a = par()[0];

  const par2 = (arr: any[]): any[] =>
  {
    const c = [];
    for (let d of arr)
    {
      if (Array.isArray(d))
      {
        if (d.length == 1 && !Array.isArray(d[0]))
        {
          c.push(d[0]);
        } else
        {
          c.push(par2(d));
        }
      } else
      {
        c.push(d);
      }
    }

    return c;
  };

  const b = par2(a);
  return b;
};

export interface chatFunctionType
{
  args: string[],
  matchs: matchType;
  wordData: wordSaveData;
  parPack: typeParPack;
  internal: {
    saveItem: (uid: string, saveDB: string, itemName: string, number: number) => void;
    getItem: (uid: string, saveDB: string, itemName: string) => Promise<any>;
    getUserConfig: (uid: string, key: string) => Promise<settingTypeValue>;
    saveUserConfig: (uid: string, key: string, value: settingTypeValue) => Promise<void>;
    removeUserConfig: (uid: string, key: string) => Promise<void>;
  };
}

const parseTrees = async (word: word, inData: any[], session: Session | wordDataInputType, wordData: wordSaveData, matchList: matchType, inputUserData: any): Promise<{ data: parTemp, message: string; } | null> =>
{
  // 遍历最深层字符串，解析后返回结果，重复运行

  const par = async (functonArray: any[], data: parTemp): Promise<{ data: any, message: string; } | null> =>
  {
    let userDataTemp = data;
    // 查看当前输入数组的各项是否都为字符串，若发现包含非字符串的项，则递归调用自身解析
    for (let i = 0; i < functonArray.length; i++)
    {
      // 如果有项是数组
      if (Array.isArray(functonArray[i]))
      {
        const a = await par(functonArray[i], JSON.parse(JSON.stringify(userDataTemp)));

        if (a)
        {
          functonArray[i] = a.message;
          userDataTemp = a.data;
        } else { saveItemDataTemp[(session.content) ? session.content : ''] = { item: {}, userConfig: {} }; userDataTemp = { item: {}, userConfig: {} }; }
      }
    }

    const which = functonArray[0];
    const arg = functonArray.slice(1);
    const matchs = matchList;

    if (funcPackKeys.includes(which))
    {
      // console.log(which);
      // console.log(userDataTemp.item)
      const overPar = await parStatement(which, {
        args: arg,
        matchs: matchs,
        wordData: wordData,
        parPack: parPack,
        internal: { // 缓存功能
          saveItem: (uid: string, saveDB: string, itemName: string, number: number) =>
          {

            if (!userDataTemp.item) { userDataTemp.item = {}; }

            if (!userDataTemp.item[uid]) { userDataTemp.item[uid] = {}; }

            if (!userDataTemp.item[uid][saveDB]) { userDataTemp.item[uid][saveDB] = {}; }

            userDataTemp.item[uid][saveDB][itemName] = number;
            saveItemDataTemp[(session.content) ? session.content : ''] = userDataTemp;
          },

          getItem: async (uid: string, saveDB: string, itemName: string) =>
          {
            const num = await word.user.getItem(uid, saveDB, itemName);

            if (!userDataTemp.item) { userDataTemp.item = {}; }

            if (!userDataTemp.item[uid]) { userDataTemp.item[uid] = {}; }

            if (!userDataTemp.item[uid][saveDB]) { userDataTemp.item[uid][saveDB] = {}; }

            if (!userDataTemp.item[uid][saveDB][itemName] && userDataTemp.item[uid][saveDB][itemName] != 0) { userDataTemp.item[uid][saveDB][itemName] = num ? num : 0; }

            saveItemDataTemp[(session.content) ? session.content : ''] = userDataTemp;

            return userDataTemp.item[uid][saveDB][itemName];
          },

          getUserConfig: async (uid: string, key: string) =>
          {
            const userConfig = await word.user.getConfig(uid);

            if (!userDataTemp.userConfig) { userDataTemp.userConfig = {}; }

            if (!userDataTemp.userConfig[uid]) { userDataTemp.userConfig[uid] = {}; }

            userDataTemp.userConfig[uid] = userConfig;
            saveItemDataTemp[(session.content) ? session.content : ''] = userDataTemp;

            return userDataTemp.userConfig[uid][key];
          },

          saveUserConfig: async (uid: string, key: string, value: settingTypeValue) =>
          {
            if (!userDataTemp.userConfig) { userDataTemp.userConfig = {}; }

            if (!userDataTemp.userConfig[uid]) { userDataTemp.userConfig[uid] = await word.user.getConfig(uid); }

            userDataTemp.userConfig[uid][key] = value;

            saveItemDataTemp[(session.content) ? session.content : ''] = userDataTemp;
          },

          removeUserConfig: async (uid: string, key: string) =>
          {
            if (!userDataTemp.userConfig[uid]) { userDataTemp.userConfig[uid] = await word.user.getConfig(uid); }
            if (!userDataTemp.userConfig[uid][key]) { return; }

            delete userDataTemp.userConfig[uid][key];

            saveItemDataTemp[(session.content) ? session.content : ''] = userDataTemp;
          }
        }
      }, session);

      if (overPar || overPar == '')
      {
        return { message: overPar, data: userDataTemp };
      } else
      {
        return null;
      }

    } else
    {
      return { message: functonArray.join(''), data: userDataTemp };
    }
  };

  const aaa = await par(inData, JSON.parse(JSON.stringify(inputUserData)));
  return aaa;
};



// 调用词库语法
const parStatement = async (which: string, toInData: chatFunctionType, session: Session | wordDataInputType) =>
{
  const str: string | void | statusMsg = await statement[which](toInData, session);

  if (typeof str == "object")
  {
    const status = str.status;
    if (status == 'end' || status == 'next' || status == 'kill')
    {
      const errorMsg = `${status}${(str.data) ? ':' + str.data : ''}`;
      throw new Error(errorMsg);
    }
    if (status == 'killthis')
    {
      return null;
    }
  } else
  {
    return (str) ? str : '';
  }
  return '';
};