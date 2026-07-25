// 日本語向けトークナイザ（MiniSearch用）
// ★重要: フロント側 src/lib/quoteSearch.ts の tokenizeJa と完全に同じロジックにすること。
//   ここを変更したら必ず両方を更新し、search-index.json を再生成する。
//
// 方式: 日本語(漢字/かな)は文字bigram、英数字は単語単位。
//       bigramは辞書不要・部分一致に強く、書き出しインデックスのサイズも予測しやすい。

const JA = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/
const ALNUM = /[0-9A-Za-zー]/

export function tokenizeJa(text) {
  if (!text) return []
  const s = String(text).toLowerCase()
  const tokens = []
  let buf = ""
  const flushAlnum = () => {
    if (buf) {
      tokens.push(buf)
      buf = ""
    }
  }
  const ja = []
  for (const ch of s) {
    if (JA.test(ch)) {
      flushAlnum()
      ja.push(ch)
    } else if (ALNUM.test(ch)) {
      buf += ch
      // 英数字が来たら日本語バッファを確定
      if (ja.length) pushJa(ja, tokens)
    } else {
      flushAlnum()
      if (ja.length) pushJa(ja, tokens)
    }
  }
  flushAlnum()
  if (ja.length) pushJa(ja, tokens)
  return tokens
}

function pushJa(ja, tokens) {
  if (ja.length === 1) {
    tokens.push(ja[0])
  } else {
    for (let i = 0; i < ja.length - 1; i++) tokens.push(ja[i] + ja[i + 1])
  }
  ja.length = 0
}
