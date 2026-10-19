// XBR听书补充包 — 随身听书(ssts)插件
// 移植自 drpy 源：博看听书 / 广播迷FM / DJ音乐
// 接口文档: https://github.com/whykang/ssts--Android/blob/main/docs/plugin-development.md

var BOOKAN_LIST = 'https://api.bookan.com.cn/voice/book/list?instance_id=25304';
var BOOKAN_UNITS = 'https://api.bookan.com.cn/voice/album/units';
var BOOKAN_SEARCH = 'https://es.bookan.com.cn/api/v3/voice/book?instanceId=25304';

function bookanBooks(json) {
  return items(json, 'data.list').map(function (it) {
    return {
      coverUrl: str(it, 'cover'),
      bookUrl: String(int(it, 'id', 0)),
      title: str(it, 'name'),
      author: str(it, 'extra.author')
    };
  }).filter(function (b) { return b.title; });
}

// ---------------- 博看听书 ----------------

registerSource({
  id: '8f4c2a91d3e74b60a5c1f9d2e8b34a17',
  name: '博看听书',
  url: 'https://api.bookan.com.cn',
  group: '听书',
  description: '博看官方接口，正版有声书，11 个分类可搜索',
  multipleEpisodePages: true,

  search: function (keywords, page) {
    var j = this.host.getJson(BOOKAN_SEARCH +
      '&keyword=' + encodeURIComponent(keywords) +
      '&pageNum=' + page + '&limitNum=20');
    return { books: bookanBooks(j), totalPage: int(j, 'data.last_page', page) };
  },

  categoryMenus: function () {
    var cats = [
      ['少年读物', '1305'], ['儿童文学', '1304'], ['国学经典', '1320'],
      ['文艺少年', '1306'], ['育儿心经', '1309'], ['心理哲学', '1310'],
      ['青春励志', '1307'], ['历史小说', '1312'], ['故事会', '1303'],
      ['音乐戏剧', '1317'], ['相声评书', '1319']
    ];
    return [{
      title: '分类',
      tabs: cats.map(function (c) {
        return { title: c[0], url: 'bk:' + c[1] + '#1' };
      })
    }];
  },

  categoryPage: function (u) {
    var m = u.match(/^bk:(\d+)#(\d+)$/);
    var cat = m[1], page = parseInt(m[2], 10);
    var j = this.host.getJson(BOOKAN_LIST +
      '&page=' + page + '&category_id=' + cat + '&num=24');
    var total = int(j, 'data.total', 0);
    return {
      books: bookanBooks(j),
      currentPage: page,
      totalPage: Math.max(1, Math.ceil(total / 24))
    };
  },

  bookDetail: function (bookUrl, loadEpisodes, loadFullPages) {
    var self = this;
    var first = BOOKAN_UNITS + '?album_id=' + bookUrl + '&page=1&num=200&order=1';
    var j = this.host.getJson(first);
    var eps = items(j, 'data.list').map(function (it) {
      return { title: str(it, 'title'), url: str(it, 'file') };
    }).filter(function (e) { return e.url; });
    var total = int(j, 'data.total', 0);
    if (loadFullPages && total > 200) {
      var pages = Math.ceil(total / 200);
      try {
        for (var p = 2; p <= pages; p++) {
          self.host.progress(p + ' / ' + pages);
          var pj = self.host.getJson(BOOKAN_UNITS +
            '?album_id=' + bookUrl + '&page=' + p + '&num=200&order=1');
          eps = eps.concat(items(pj, 'data.list').map(function (it) {
            return { title: str(it, 'title'), url: str(it, 'file') };
          }).filter(function (e) { return e.url; }));
        }
      } finally {
        self.host.progress(null);
      }
    }
    return { episodes: eps };
  }
});

// ---------------- 广播迷FM ----------------

var GB_CATS = [
  ['新闻综合', 'fmlist20'], ['交通', 'fmlist58'], ['音乐', 'fmlist57'],
  ['经济', 'fmlist56'], ['生活', 'fmlist59'], ['文艺', 'fmlist60'],
  ['都市', 'fmlist61'], ['故事', 'fmlist62'], ['旅游', 'fmlist63'],
  ['乡村', 'fmlist64'], ['娱乐', 'fmlist65'], ['戏曲', 'fmlist66'],
  ['体育', 'fmlist67'], ['评书相声', 'fmlist69'], ['青少科教', 'fmlist70'],
  ['网络台', 'fmlist113'], ['汽车', 'fmlist134'], ['其他', 'fmlist135']
];

registerSource({
  id: 'c7d81e52a9b34f6081d6c2e5b7a4f392',
  name: '广播迷FM',
  url: 'http://www.guangbomi.com',
  group: '广播',
  description: '全国广播电台直播，多信号源自动切换',

  categoryMenus: function () {
    return [{
      title: '电台分类',
      tabs: GB_CATS.map(function (c) {
        return { title: c[0], url: 'gb:' + c[1] + '#1' };
      })
    }];
  },

  categoryPage: function (u) {
    var m = u.match(/^gb:([a-z0-9]+)#(\d+)$/);
    var list = m[1], page = parseInt(m[2], 10);
    var doc = this.host.getHtml('http://www.guangbomi.com/' + list + '.html?page=' + page);
    var books = doc.select('li.ax-grid-block').map(function (li) {
      var a = li.first('a');
      return {
        coverUrl: '',
        bookUrl: a.absUrl('href'),
        title: li.first('.radio-title').text()
      };
    }).filter(function (b) {
      return b.title && b.bookUrl.indexOf('/live/') > -1;
    });
    return {
      books: books,
      currentPage: page,
      nextUrl: books.length > 0 ? 'gb:' + list + '#' + (page + 1) : ''
    };
  },

  bookDetail: function (bookUrl) {
    var doc = this.host.getHtml(bookUrl);
    var title = doc.first('h1').text();
    var eps = [];
    var iframeSrc = doc.first('iframe#player').absUrl('src');
    if (iframeSrc) {
      var pdoc = this.host.getHtml(iframeSrc);
      var srcs = pdoc.select('a').filter(function (a) {
        return a.attr('href').indexOf('f=mediaurl') > -1;
      });
      if (srcs.length > 0) {
        srcs.forEach(function (a) {
          var name = a.text();
          eps.push({ title: '直播 · ' + name, url: a.absUrl('href'), live: true });
        });
      } else {
        eps.push({ title: '直播', url: iframeSrc, live: true });
      }
    }
    if (eps.length === 0) throw new Error('未找到播放信号');
    return { title: title, episodes: eps };
  },

  audio: function (episodeUrl) {
    var doc = this.host.getHtml(episodeUrl);
    var iframe = doc.first('.playcode iframe').absUrl('src');
    if (!iframe) throw new Error('未找到播放器页面');
    // cnr/xm 等中转页通过 302 把 m3u8 带在最终地址里
    var fin = this.host.finalUrl(iframe);
    var m = fin.match(/id=(https?:\S+?\.m3u8\S*)/);
    if (m) return m[1];
    // 蜻蜓等中转页把直链写在页面里
    var html = this.host.getString(iframe);
    var s = html.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp3|aac)[^"'\s<>]*/);
    if (s) return s[0];
    throw new Error('未取到直播流，请换一个信号源');
  }
});

// ---------------- DJ音乐 ----------------

var DJ_CATS = [
  ['迪高串烧', '1'], ['慢摇串烧', '2'], ['慢歌串烧', '3'],
  ['中文Remix', '4'], ['外文Remix', '5'], ['HOUSE', '6'],
  ['霓虹风格', '7'], ['Mashup', '8'], ['中文DISCO', '9'],
  ['外文DISCO', '10'], ['中文串烧', '13'], ['外语串烧', '14'],
  ['喊麦串烧', '15'], ['中文慢歌', '18'], ['外语慢歌', '19'],
  ['中英慢歌', '20'], ['Club', '21'], ['Electro', '22'],
  ['ElectroHouse', '23'], ['ProgHouse', '26'], ['中国风Electro', '28'],
  ['Electro/Vina/Bass', '30'], ['DeepHouse', '36'], ['TechHouse/Vocal', '37'],
  ['Future/Bigroom/Edm', '40'], ['HipHop', '43'], ['Funky/Rap', '44'],
  ['Dubstep', '46'], ['Trap', '48'], ['Pop', '49'],
  ['Rock', '50'], ['蓝调', '52'], ['中文', '53'],
  ['PartyBreak', '56'], ['Remixes', '57'], ['Hard', '60'],
  ['DISCO', '61'], ['Disco/PopDance', '62'], ['Techno/Trance', '64'],
  ['RnB', '94'], ['中英串烧', '96'], ['酒吧串烧', '97'],
  ['FunkyHouse', '99'], ['独家舞曲', '115']
];

function parseDjList(doc) {
  var links = doc.select('.list_musiclist p.t1 a');
  var imgs = doc.select('.list_musiclist li.list_play_img img');
  return links.map(function (a, i) {
    return {
      coverUrl: i < imgs.length ? imgs[i].absUrl('src') : '',
      bookUrl: a.absUrl('href'),
      title: a.attr('title')
    };
  }).filter(function (b) {
    return b.title && b.bookUrl.indexOf('/play/') > -1;
  });
}

registerSource({
  id: 'd2a95c68e1f74b309c5d8e2a6f1b7c43',
  name: 'DJ音乐',
  url: 'http://www.djuu.com',
  group: '音乐',
  description: 'DJUU 舞曲网，44 个分类，320K 音质直链',

  search: function (keywords, page) {
    var doc = this.host.getHtml('http://www.djuu.com/search?musicname=' +
      encodeURIComponent(keywords), { desktop: true });
    var books = parseDjList(doc);
    return { books: books, totalPage: books.length > 0 ? page + 1 : page };
  },

  categoryMenus: function () {
    return [{
      title: '舞曲分类',
      tabs: DJ_CATS.map(function (c) {
        return { title: c[0], url: 'dj:' + c[1] + '#1' };
      })
    }];
  },

  categoryPage: function (u) {
    var m = u.match(/^dj:(\d+)#(\d+)$/);
    var cat = m[1], page = parseInt(m[2], 10);
    var doc = this.host.getHtml('http://www.djuu.com/djlist/' + cat + '_' + page + '.html',
      { desktop: true });
    var books = parseDjList(doc);
    return {
      books: books,
      currentPage: page,
      nextUrl: books.length > 0 ? 'dj:' + cat + '#' + (page + 1) : ''
    };
  },

  bookDetail: function (bookUrl) {
    var html = this.host.getString(bookUrl, { desktop: true });
    var m = html.match(/var music = \{id:\s*\d+,\s*type:\s*'[^']*',\s*name:\s*'([^']*)'/);
    var title = m ? m[1] : '';
    return { title: title, episodes: [{ title: title || '播放', url: bookUrl }] };
  },

  audio: function (episodeUrl) {
    var html = this.host.getString(episodeUrl, { desktop: true });
    var m = html.match(/file:\s*'([^']+)'/);
    if (!m) throw new Error('未取到音频地址');
    return 'http://mp4.djuu.com/' + m[1] + '.m4a';
  },

  audioHeaders: function () {
    return { Referer: 'http://www.djuu.com/' };
  }
});

// ============ 听吧CMS 网络小说听书（对 /books/ 同族站通用） ============
// 模板：分类 /html/{cid}.html，书 /books/{id}.html，章节 /mp3/{id}-{f}-{n}.html
// 章节页内联 var now="音频直链"（喜马拉雅免费 CDN），搜索需一次验证码

function tingCards(doc) {
  var out = [];
  var cards = doc.select('.style-img');
  cards.forEach(function (card) {
    var link = null, linkEl = null;
    var anchors = card.select('a[href*="/books/"]');
    anchors.forEach(function (a) {
      if (!linkEl && a.text()) linkEl = a;
    });
    if (linkEl) {
      link = linkEl.absUrl('href');
      out.push({
        coverUrl: card.first('img').absUrl('src'),
        bookUrl: link,
        title: linkEl.text()
      });
    }
  });
  var seen = {};
  return out.filter(function (b) {
    if (seen[b.bookUrl] || !b.title) return false;
    seen[b.bookUrl] = true;
    return true;
  });
}

var TING_CMS_SITES = [
  {
    id: 'e5a03b7c8d1f4a29b6e0c3d7f8a15b42',
    name: '海洋听书',
    base: 'https://www.79ting.com'
  },
  {
    id: 'f6b14c8d9e2a5b30c7f1d4e8a9b26c53',
    name: '天天听书',
    base: 'https://www.02ting.com'
  }
];

function makeTingSource(cfg) {
  var menuCacheKey = 'tingmenu_' + cfg.name;
  return registerSource({
    id: cfg.id,
    name: cfg.name,
    url: cfg.base,
    group: '有声小说',
    description: '网络小说/评书有声站（听吧CMS）。搜索首次使用需输一次验证码。',

    categoryMenus: function () {
      var cached = this.host.readCache(menuCacheKey);
      if (cached && this.host.cacheAge(menuCacheKey) < 86400000) {
        return JSON.parse(cached);
      }
      var raw = this.host.getString(cfg.base);
      var re = /href="((?:https?:\/\/[^"]*)?\/html\/\d+\.html)"[^>]*(?:title="([^"]{1,10})")?[^>]*>([^<]{1,10})</g;
      var m, seen = {}, list = [];
      while ((m = re.exec(raw))) {
        var href = m[1];
        var t = (m[2] || m[3] || '').trim();
        if (!t || seen[href]) continue;
        seen[href] = true;
        if (href.indexOf('http') !== 0) href = cfg.base + href;
        list.push({ title: t, url: 'tgp:' + href });
        if (list.length >= 30) break;
      }
      var menus = [{ title: '分类', tabs: list }];
      if (list.length > 0) this.host.writeCache(menuCacheKey, JSON.stringify(menus));
      return menus;
    },

    categoryPage: function (u) {
      var doc = this.host.getHtml(u.substring(4));
      return { books: tingCards(doc), currentPage: 1 };
    },

    search: function (keywords, page) {
      var html = this.host.getString(cfg.base + '/search.php?searchword=' +
        encodeURIComponent(keywords));
      if (/安全验证|安全提示|checkcode/i.test(html)) {
        throw new Error('需要输一次验证码：点下方"验证"，通过后自动重试');
      }
      var doc = this.host.parseHtml(html, cfg.base);
      return { books: tingCards(doc), totalPage: page };
    },

    searchVerificationUrl: function (keywords) {
      return cfg.base + '/search.php?searchword=' + encodeURIComponent(keywords);
    },

    bookDetail: function (bookUrl) {
      var doc = this.host.getHtml(bookUrl);
      var head = doc.first('.style-img');
      var title = doc.first('h1.style-title').text() || '';
      var plain = head.text().replace(/\u00a0/g, ' ');
      var author = (plain.match(/作者：([^，,\s]+)/) || ['', ''])[1];
      var artist = (plain.match(/由\s*([^，,\s]+?)\s*播音/) || ['', ''])[1];
      var intro = (plain.match(/内容介绍：([\s\S]+?)(?:猜你|相关|最新剧透|$)/) || ['', ''])[1].trim();
      if (intro.length > 500) intro = intro.substring(0, 500) + '…';
      var seen = {};
      var eps = doc.select('a[href*="/mp3/"]').map(function (a) {
        return { title: a.attr('title') || a.ownText() || a.text(), url: a.absUrl('href') };
      }).filter(function (e) {
        if (!e.title || !/\/mp3\/\d+-\d+-\d+\.html/.test(e.url)) return false;
        if (seen[e.url]) return false;
        seen[e.url] = true;
        return true;
      });
      return {
        title: title,
        coverUrl: head.first('img').absUrl('src'),
        author: author,
        artist: artist,
        intro: intro,
        episodes: eps
      };
    },

    audio: function (episodeUrl) {
      var html = this.host.getString(episodeUrl);
      var m = html.match(/var now="([^"]+)"/);
      if (!m) m = html.match(/var now='([^']+)'/);
      if (!m) throw new Error('未取到音频地址');
      return m[1];
    }
  });
}

TING_CMS_SITES.forEach(function (cfg) {
  makeTingSource(cfg);
});
