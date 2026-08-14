import { site } from "@/lib/site.config"

/**
 * 構造化データ(JSON-LD)。
 *
 * 目的: 「otoiresensei」ではヒットするのに「おトイレ先生」でヒットしない状態の解消。
 *   ローマ字表記は本番URL(otoiresensei-pj.web.app)に含まれるため検索エンジンが拾えるが、
 *   日本語表記はHTML中の文字列としてしか存在しなかった。
 *   JSON-LD で「このサイトは “おトイレ先生” という人物について書かれたサイトであり、
 *   otoiresensei は同一人物の別表記である」と明示的に申告することで、
 *   表記ゆれを1つのエンティティとして認識させる。
 *
 * sameAs には本人の公式チャンネル/SNSを列挙する。これは「同一エンティティを指す
 * 権威あるURL」の申告であり、非公式ファンサイトから公式へのひも付けとして正しい使い方。
 * （このサイト自身が公式であると主張するものではない）
 *
 * 静的エクスポート(output: "export")でもそのままHTMLに埋め込まれるため追加コストは無い。
 */
export default function StructuredData() {
  const person = {
    "@type": "Person",
    "@id": `${site.siteUrl}/#person`,
    name: site.personName,
    alternateName: site.aliases,
    description: site.intro,
    image: site.channelIcon,
    url: site.sns.youtube,
    sameAs: [site.sns.youtube, site.sns.x, site.sns.marshmallow].filter(
      (u) => u && !u.includes("CHANGE_ME")
    ),
  }

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      person,
      {
        "@type": "WebSite",
        "@id": `${site.siteUrl}/#website`,
        url: `${site.siteUrl}/`,
        name: site.name,
        alternateName: site.aliases,
        description: site.description,
        inLanguage: "ja",
        // このサイトが「誰について」書かれたものかを明示する = 表記ゆれ解決の本体
        about: { "@id": `${site.siteUrl}/#person` },
        mainEntity: { "@id": `${site.siteUrl}/#person` },
        // 非公式であることを構造化データ上でも曖昧にしない
        isFamilyFriendly: true,
        copyrightNotice: "非公式ファンサイト（本人・所属事務所とは関係ありません）",
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify の結果に </script> は現れないが、念のため < をエスケープしておく
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  )
}
