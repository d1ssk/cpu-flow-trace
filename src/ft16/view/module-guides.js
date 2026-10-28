/* Module-specific input → processing → output guides. These describe the
 * circuit contract; live values and decisions remain in def.explain(). */
import { SIGNAL_DOC } from '../sim/control.js';
import { formatValue } from '../sim/format.js';

export const MODULE_GUIDES = {
  "REG": {
    "input": "d は保存したい {0} bit の値です。入力端子に到着した値が、次の取り込みの候補になります。",
    "process": "クロックの立ち上がりで d を取り込みます。クロックの間は d が変わっても保存値を変えません。開始時には、この教材で定めたリセット値を保持しています。",
    "output": "q は保存済みの {0} bit を常に出します。q は d の通り抜けではありません。保存値が変わると、q からの新しい信号が接続先へ伝播し始めます。",
    "options": [
      {
        "port": "en",
        "input": "en は書き込み許可です。",
        "process": "en = H の立ち上がりだけ取り込み、en = L ならそのクロックでも以前の値を保持します。"
      }
    ]
  },
  "HALTFF": {
    "input": "set は停止状態に入る要求です。",
    "process": "クロックの立ち上がりで set = H なら停止状態を記憶します。set が L に戻っても記憶は残るので、停止要求を出し続ける必要はありません。",
    "output": "q = H は停止状態、q = L は実行可能な状態です。接続先の制御回路がこの値を使い、命令の取り込みや書き込みを止めます。",
    "options": [
      {
        "port": "clr",
        "input": "clr は停止状態を解除する要求です。",
        "process": "clr = H は set より優先し、次の立ち上がりで停止状態を解除します。"
      }
    ]
  },
  "MUX": {
    "input": "in0・in1…は選択候補の {0} bit データ、sel は候補の番号です。このモジュールには {1} 個の候補があります。定数の候補には入力配線がありません。",
    "process": "sel = 0 なら in0、sel = 1 なら in1、というように1つだけ選びます。計算や保存はせず、選択したデータをそのまま通します。候補にない番号では0を出します。",
    "output": "y が選択結果です。選択中の入力、または sel が変われば y も再評価されます。選択されていない入力だけが変わっても y は変わりません。"
  },
  "INC": {
    "input": "a は加算の元になる {0} bit の値です。PC+1 の回路では、現在の命令番地がここへ届きます。",
    "process": "a に固定値 {1} を加え、下位 {0} bit だけを残します。上限を超えると0側へ折り返します。クロックを待たず、入力の到着時に再計算します。",
    "output": "y は加算後の値です。次の番地候補などを接続先へ渡します。この加算器自体は PC を保存・更新しません。"
  },
  "ADD": {
    "input": "a と b は足し合わせる2つの {0} bit の値です。分岐先の計算では、基準番地と命令から取り出したオフセットなどが接続されます。",
    "process": "a + b を計算し、下位 {0} bit を残します。符号拡張済みの負のオフセットも同じ加算で扱えます。結果は保存せず、入力が届くたびに再計算します。",
    "output": "y は和です。番地の選択回路やレジスタの入力へ渡されます。このモジュールには桁上がりやフラグ専用の出力はありません。"
  },
  "ALU": {
    "input": "a・b は16 bitの演算対象、op は演算の種類です。op は 0 ADD、1 SUB、2 AND、3 OR、4 XOR、5 SHL、6 SHR、7 SRA、8 PASS に対応します。",
    "process": "op に応じて加減算・ビット演算・シフトを行い、PASS では b を通します。シフト量は b の下位4 bitです。入力に変化が届くたびに結果とフラグを計算します。ALU内では結果を保存しません。",
    "output": "y は16 bitの結果、flags は bit 0から Z・C・N・V です。Z はゼロ、C は桁上がり（減算では借り、シフトでは最後に押し出されたビット）、N は符号、V は符号付きのあふれです。PASSでは flags = 0 です。フラグの保存は別のレジスタと書き込み許可信号が担います。"
  },
  "REGFILE": {
    "input": "ra・rb は読むレジスタの番号（0〜7）、wa は書き込み先の番号です。wd は書き込む16 bitの値、we は書き込み許可です。",
    "process": "8本のレジスタを保持し、2つの読み出し口で別々のレジスタを同時に読みます。we = H の立ち上がりで wd を wa のレジスタに保存します。r0 は常に0で、r0への書き込みは捨てます。",
    "output": "da は ra の読み出し値、db は rb の読み出し値です。読み出しはクロックを待ちません。レジスタ番号や読み出し元の保存値が変わると、対応する出力を更新します。"
  },
  "MEMORY": {
    "input": "iaddr は読み出す命令の語番地です。このメモリは命令とデータを同じ512語 × 16 bitの領域に置きます。番地はバイト単位ではなく語単位です。",
    "process": "指定された番地の保存内容を読み出します。読み出しは組み合わせ処理なので、番地が到着すると再評価します。プログラムはリセット時に配置されます。",
    "output": "idata は iaddr にある16 bitの命令語です。命令の意味を解釈するのは、この後につながるデコーダです。",
    "options": [
      {
        "port": "daddr",
        "input": "daddr はデータの番地、wd は書き込む値、we は書き込み許可です。",
        "process": "we = H の立ち上がりで、RAM範囲の daddr に wd を保存します。読み出しと書き込みのタイミングは異なります。",
        "output": "rd は daddr にあるデータです。"
      },
      {
        "port": "dreq",
        "input": "dreq はデータ側がメモリを使う要求です。",
        "process": "1ポート設定ではデータ側を優先し、命令側を待たせます。2ポート設定では両方を同時に読み出せます。",
        "output": "命令側が待つ間は iwait = H、idata = 0 となります。"
      }
    ]
  },
  "FIELDS": {
    "input": "ir はメモリから届いた16 bitの命令語です。レジスタ番号や即値は、この命令語の中にビットとして埋め込まれています。",
    "process": "命令形式を見てビットを切り分け、必要な即値を16 bitへ拡張します。符号付きの即値は符号拡張し、LUIでは上位側に配置します。演算やレジスタへの書き込みは行いません。",
    "output": "ra・rb は読み出し番号、rd は書き込み先番号、imm は展開済みの即値です。STでは保存するレジスタを rb に、JALではリンクレジスタ r7 を rd に選ぶなど、命令に応じて対応が変わります。"
  },
  "CONTROL": {
    "input": "ir は解読する16 bitの命令語です。データの値そのものではなく、何を実行するかを指定する命令を受け取ります。",
    "process": "オペコードと命令形式から、演算の種類・データ経路の選択・書き込み許可を決めます。命令の解読だけを行い、計算結果を保存するのは接続先のモジュールです。",
    "output": "各出力は各部への指示です。1 bitの許可信号は H のとき有効、複数 bitの選択信号は選択肢の番号を表します。この構成に存在する出力と役割は下に示します。",
    "options": [
      {
        "port": "halted",
        "input": "halted は停止フラグです。",
        "process": "halted = H なら、すべての制御出力を0にします。"
      },
      {
        "port": "kernel",
        "input": "kernel はカーネルモードかどうかを表します。",
        "process": "ユーザーモードでの特権命令は通常の動作を許可せず、不正命令として扱います。"
      }
    ]
  },
  "PCSEL": {
    "input": "pcSrc は命令が要求する次PCの種類、cond は分岐条件、flags は保存された Z・C・N・V です。行き先の番地そのものを計算する回路ではありません。",
    "process": "条件分岐なら cond を flags に照らして判定し、不成立なら PC+1 を選びます。通常の順次実行、相対ジャンプ、間接ジャンプ、割り込みからの復帰も、対応する候補の番号へ変換します。",
    "output": "sel は次PC用MUXへの選択番号（0 PC+1、1 target、2 rs1+imm、3 EPC、4 vector）、en はPCレジスタの更新許可です。必要な候補だけが各段階の回路に接続されています。",
    "options": [
      {
        "port": "halted",
        "input": "halted は停止状態です。",
        "process": "停止中は en = L とし、PCを保持させます。"
      },
      {
        "port": "take",
        "input": "take はトラップを受け付ける指示です。",
        "process": "take = H は停止や通常の選択より優先し、sel = 4 と en = H でトラップベクタへ進めます。"
      }
    ]
  },
  "ADEC": {
    "input": "addr はアクセス先の16 bit番地、we は書き込み要求です。",
    "process": "番地を比較して、RAM（0x0000〜0x01FF）、LED・スイッチ（0xFFF0〜0xFFF1）、タイマ（0xFFF2〜0xFFF3）、未接続領域に分類します。データそのものは運ばず、どこを有効にするかを決めます。",
    "output": "この構成にある行き先別の書き込み許可信号だけを出します。選ばれていない装置には書き込みを許可しません。",
    "options": [
      {
        "port": "ramWe",
        "output": "ramWe はRAMへの書き込み許可です。"
      },
      {
        "port": "re",
        "input": "re は読み出し要求です。",
        "output": "ramReq はRAM範囲への読み書き要求です。"
      },
      {
        "port": "sel",
        "output": "ioWe・tmWe はI/O・タイマへの書き込み許可、sel は読み出しMUXの選択（0 RAM、1 I/O、2 TIMER、3 未接続）です。"
      }
    ]
  },
  "IODEV": {
    "input": "addr は装置内の番地、wd は書き込みデータ、we は書き込み許可です。画面のスイッチ操作も、外部からの入力になります。",
    "process": "0xFFF0はLEDの保存値、0xFFF1はスイッチの値に対応します。we = H かつ addr = 0xFFF0 の立ち上がりで wd の下位8 bitをLED用レジスタに保存します。スイッチはCPUからは書き換えません。",
    "output": "rd は選択したLEDの保存値またはスイッチの値を16 bitで返します。その他の番地では0です。LEDの点灯は保存値を表示しており、wd に届いただけでは変化しません。"
  },
  "TIMER": {
    "input": "addr は周期（0xFFF2）または要求状態（0xFFF3）の番地、wd は設定値、we は書き込み許可です。CPUと同じクロックを数えます。",
    "process": "周期が0でなければ4クロックを1カウントとし、設定周期に達すると要求を保持します。周期を書き込むとカウントを0に戻し、要求状態への書き込みで要求を解除します。これらの更新は立ち上がりで行います。",
    "output": "rd は選択した周期または要求状態、irq は割り込み要求です。irq は一瞬のパルスではなく、要求が保持されている間 H になります。受け付けるかは別のトラップ判定回路が決めます。"
  },
  "GATE": {
    "input": "i_で始まる端子は通過候補の制御信号です。kill はその命令の効果を取り消す指示です。",
    "process": "kill = H なら全出力を0にし、それ以外では入力を同名の出力へそのまま通します。書き込みデータを消すのではなく、書き込みを許可する信号などを止めます。",
    "output": "出力は i_ を取り除いた名前の制御信号です。接続先のレジスタやメモリが、この許可をクロックで参照して更新するかを決めます。",
    "options": [
      {
        "port": "halted",
        "input": "halted は停止状態です。",
        "process": "halted = H でも全出力を0にします。"
      },
      {
        "port": "wait",
        "input": "wait はメモリなどの完了待ちです。",
        "process": "wait = H の間も全出力を0にし、同じ命令の効果が繰り返し書き込まれることを防ぎます。"
      }
    ]
  },
  "TRAP": {
    "input": "irq は割り込み要求、ie は受け付け許可、halted は停止状態、pc は保存する戻り番地の元です。",
    "process": "irq と ie がともに H なら割り込みを受け付けます。判定は入力の到着で行い、戻り番地を保存したり実際にPCを変更したりする処理は、接続先のCSR・PC回路がクロックで行います。",
    "output": "take はトラップ受け付け、cause は原因番号、epc は保存する戻り番地です。通常は pc を epc に渡し、命令をそこから再開できるようにします。",
    "options": [
      {
        "port": "illegal",
        "input": "itlbMiss・ifault・illegal・syscall・dtlbMiss・wfault は例外の種類、dva はデータ仮想番地、pcInc は次の命令番地です。",
        "process": "割り込みを優先し、その次に命令TLBミス→実行保護→不正命令→システムコール→データTLBミス→書き込み保護を判定します。停止中は命令の例外を受け付けません。",
        "output": "システムコールの epc は pcInc です。badva には命令側の障害なら pc、データ側なら dva を渡します。"
      }
    ]
  },
  "CSRFILE": {
    "input": "num は読む・書くCSRの番号、wd・we は書き込み値と許可です。take・cause・epcIn・flags はトラップ時に保存する情報、reti・ei・di は復帰・割り込み許可・禁止の指示です。",
    "process": "STATUS・ESTAT・EPC・CAUSEなどを保持します。立ち上がりでは take→reti→ei→di→we の順で優先します。トラップ時は元の状態とフラグをESTATへ、戻り番地をEPCへ保存し、割り込み禁止にします。読むだけならクロックを待ちません。",
    "output": "rd は num で選んだCSR（0 STATUS、1 ESTAT、2 EPC、3 CAUSE、4 BADVA、5 SCRATCH）、ie は割り込み許可、epc は保存した戻り番地、eflags はESTAT内のフラグです。",
    "options": [
      {
        "port": "kernel",
        "input": "badva はアドレス関連の例外で保存する問題の仮想番地です。",
        "process": "トラップ時はカーネルモードへ入り、RETIで保存したモードを復元します。",
        "output": "kernel はカーネルモードで H となり、TLBや特権命令の判定へ渡ります。"
      }
    ]
  },
  "TLB": {
    "input": "va は変換する16 bit仮想番地、kernel はモード、req はアクセス要求です。we・wa・wb はTLBエントリを書き換える指示と符号化された設定値です。",
    "process": "32語を1ページとし、va の上位11 bitを4つの有効エントリと比較します。一致すれば物理ページ番号に置き換え、下位5 bitは残します。カーネルモードでは変換を省略します。対象TLBへの we = H の立ち上がりで、wa・wbをエントリに保存します。",
    "output": "pa は変換結果、miss は要求時に一致するエントリがないこと、fault はアクセス権違反です。ユーザーモードでの判定結果をトラップ回路へ渡します。ミス時の pa は va のままなので、miss と組み合わせて扱います。",
    "options": [
      {
        "port": "write",
        "input": "write はデータを書き込むアクセスかどうかを表します。",
        "process": "データTLBでは write = H のとき、エントリの書き込み許可 W を検査します。"
      },
      {
        "port": "exc",
        "output": "exc は命令TLBミスまたは実行保護違反の原因番号です。パイプラインでは命令と一緒に運びます。"
      }
    ]
  },
  "SMEM": {
    "input": "addr は命令またはデータの語番地、req はアクセス要求、we は書き込み指定、wd は書き込む16 bitです。命令とデータで同じ1つのポートを使います。",
    "process": "req を保ったまま設定されたクロック数を待ちます。ready = H になると読み出し値を出し、書き込みなら ready と we が H の立ち上がりで保存します。応答を受け取るまでは番地とデータを保つ必要があります。",
    "output": "ready は要求を完了できる合図、rd は読み出した16 bitです。待っている間の rd は0なので、制御回路は ready を確認してから値をレジスタに取り込みます。"
  },
  "MCCTRL": {
    "input": "state は状態レジスタの値、ir は命令、flags は分岐用フラグです。ready はメモリの応答、irq は受け付ける割り込み、halted は停止状態を表します。",
    "process": "FETCH→DECODE→EXECを基本に、演算ならALUWB、読み書きならMEM・MEMWBへ進むよう制御します。ready が L の間は必要な待ち状態に留まります。このモジュールは次の状態を計算する組み合わせ回路で、状態の保存は外のSTATEレジスタが行います。",
    "output": "next は次の状態番号です。残りの出力はMUXの選択、メモリ要求、PC・IR・MDR・ALUOUT・レジスタファイルなどの書き込み許可で、この段階で必要な処理だけを有効にします。"
  },
  "PIPEREG": {
    "input": "d_で始まる各端子は前段の結果です。命令の有効性 v、番地、データ、制御信号などをひとまとまりに受け取ります。en は取り込み許可、clr は内容の消去です。",
    "process": "立ち上がりで clr = H なら全項目を0にし、そうでなければ en = H のとき全項目を同時に取り込みます。どちらも L なら保持します。clr は en より優先し、v = L の「泡」を作れます。",
    "output": "d_を取り除いた同名の端子に、保持した各項目を出します。データと制御信号を同じ命令の組として次段へ渡すことで、別の命令の制御で計算してしまうことを防ぎます。"
  },
  "UNPACK": {
    "input": "bus は複数の制御信号を詰めたビット列です。各信号の位置と幅は、このモジュールの構成で固定されています。",
    "process": "bus を決められたビット範囲に分けます。命令の再解読や計算、保存は行わず、束になった配線を個々の信号へ分配します。",
    "output": "各出力は取り出した制御信号です。下に示す出力名とビット幅が、この段で使える信号に対応します。"
  },
  "PCTRL": {
    "input": "ir は命令語、v は有効な命令かどうかです。v = L は命令が入っていない「泡」を表します。",
    "process": "命令を解読して、実行段・メモリ段・書き戻し段で必要な制御をそれぞれまとめます。v = L なら制御信号を0にし、泡がレジスタやメモリを書き換えないようにします。",
    "output": "ex・m・wb は各段へ運ぶ制御信号の束です。useA・useB はどの読み出し値を使うか、ctl は分岐など取り込みを待つ必要がある命令かを表し、ハザード検出へ渡します。",
    "options": [
      {
        "port": "kernel",
        "input": "kernel は特権判定用のモード、iexc は命令の取り込み時に見つかった例外です。",
        "process": "取り込み時の例外や不正・特権命令を検出すると、その命令の通常の制御を止め、例外を後段へ運びます。",
        "output": "exc は例外の原因番号で、命令とともにMEM段のトラップ判定まで運ばれます。"
      }
    ]
  },
  "CONFIG": {
    "input": "回路からの入力端子はありません。画面で選んだハザード処理の設定が入力元です。",
    "process": "選ばれた設定を2 bitの番号にします。0はストールのみ、1はフォワーディング、2はフォワーディングとフラッシュ、3は分岐予測も使う設定です。",
    "output": "mode をハザード検出・フォワーディング・分岐予測へ渡し、同じ回路で処理方式を比較できるようにします。"
  },
  "HAZARD": {
    "input": "ra・rb と useA・useB は後続命令が読むレジスタ、deRd・deWb・deM は先行命令の書き込み先と制御です。ctl は制御系の命令、mode は処理方式です。",
    "process": "読みたいレジスタと、まだ結果が使えない先行命令の書き込み先を比較します。ストール方式では書き戻しまで待ち、フォワーディング方式では直接受け取れる値なら進みます。5段構成のロード直後など、直接渡しても間に合わない依存は待たせます。",
    "output": "stall = H はデータ依存による停止要求、hold = H は分岐などの行き先が決まるまで取り込みを待つ要求です。実際に各レジスタを止める信号はNPCが作ります。",
    "options": [
      {
        "port": "emRd",
        "input": "emRd・emWb は、さらに先の段にある命令の書き込み先と制御です。"
      }
    ]
  },
  "FWD": {
    "input": "ra・rb は実行する命令の読み出し番号、mwRd・mwWe は書き戻す先行命令の番号と許可、mode はフォワーディングを使うかどうかです。演算データ自体はこの回路に入りません。",
    "process": "同じレジスタへ書く先行命令があれば、その結果を直接受け取る経路を選びます。mode = 0 では通常のレジスタ値を選びます。データを転送するのは外部のMUXで、この回路は選択番号を決めます。",
    "output": "selA・selB が2つの入力経路の選択です。0はレジスタ値、2は書き戻し側の結果です。",
    "options": [
      {
        "port": "emRd",
        "input": "emRd・emWb はEX/MEM側の書き込み先と制御です。",
        "process": "EX/MEM側で結果が既に得られる演算を優先し、ロードなど未完成の結果は選びません。",
        "output": "1はEX/MEM側の結果を選びます。"
      }
    ]
  },
  "BRU": {
    "input": "br・jal・jalr は分岐の種類、cond・flags は分岐条件とフラグです。pc1 は順次実行の番地、target・jtarget は候補の行き先、pn は取り込み時の予測番地です。",
    "process": "条件を判定し、成立なら分岐先、不成立なら pc1 を実際の次PCにします。JAL・JALRは無条件です。求めた番地と pn を比べ、予測違いなら取り込み直しを要求します。",
    "output": "npc は正しい次PC、redirect は予測の修正要求、taken は分岐成立、isBr は分岐命令であることです。後者2つと番地は予測器の学習にも使われます。"
  },
  "BTB": {
    "input": "pc は取り込み中の番地、pc1 はその次の番地、mode は予測方式です。upd・upc1・taken・target は実行済みの分岐から届く学習用の情報です。",
    "process": "pc の下位2 bitで4項目の表を引き、タグ一致と2 bitカウンタで成立を予測します。mode = 3 かつカウンタが2以上なら記録した行き先を選びます。upd が有効な立ち上がりで、成立ならカウンタを増やし、不成立なら減らします（0〜3）。",
    "output": "pn は予測した次PC、pt は成立と予測したとき H です。予測を使わない、表が一致しない、または不成立予測なら pn = pc1 です。",
    "options": [
      {
        "port": "hold",
        "input": "hold は予測表の更新を待たせる信号です。",
        "process": "hold = H の間は学習用の情報があっても表を更新しません。"
      }
    ]
  },
  "NPC": {
    "input": "exRedir・memRedir は行き先の修正、stall はデータ依存、hold は制御命令待ち、halted は停止状態です。待ち機能のある構成では fwait・mwait も受け取ります。",
    "process": "待ちや修正の理由を調停し、PCと各パイプラインレジスタを進める・保持する・消すか決めます。メモリ全体の待ちを優先し、行き先を修正する場合はそれより若い命令を消します。ストールでは必要な段を保持し、進められる先行命令は進めます。",
    "output": "sel はPC用MUXの選択（0 予測、1 実行段の修正、2 メモリ段の修正）。pcEn と各段の En は更新許可、Clr は次の立ち上がりで泡にする指示です。"
  },
  "MREDIR": {
    "input": "m はメモリを扱う段まで運ばれた制御信号の束、pc1 はその命令の次の番地です。",
    "process": "HALT・FENCEIなど、後続の取り込み直しが必要な命令を見つけます。通常の命令では修正せず、状態を変更する命令では pc1 から取り込み直すよう指示します。",
    "output": "redirect は行き先修正の要求、target は修正先の番地です。NPCとPC用MUXへ渡し、PCの更新と若い命令の破棄につなげます。",
    "options": [
      {
        "port": "trap",
        "input": "trap はトラップ要求、epc はRETIの戻り番地です。",
        "process": "トラップを最優先してベクタ番地へ、RETIなら epc へ修正します。"
      }
    ]
  },
  "PTRAP": {
    "input": "v・exc・m はMEM段の命令の有効性・持ち越した例外・制御です。dtlbMiss・wfault・dva はデータ側の障害、irq・ie は割り込み、wait はメモリ待ち、halted は停止状態です。pc・pc1・npc は再開番地を決めるために使います。",
    "process": "命令が持ってきた例外、データ側の例外、割り込みの順に判定します。例外では問題の命令の効果を取り消し、割り込みではMEM段の命令を完了させてから受け付けます。メモリ待ちや状態変更命令の間の割り込みは待たせます。",
    "output": "take はトラップ要求、fault は当該命令の効果も取り消す指示、cause は原因、epc は再開番地、badva は問題の仮想番地です。CSRへの保存と後続命令の破棄に使われます。"
  },
  "FLAGCTL": {
    "input": "exWrite は実行段のフラグ書き込み要求、kill はその命令を破棄する指示です。",
    "process": "exWrite = H でも kill = H なら書き込みを止めます。行き先修正などで捨てる命令が、後に使うフラグを変えてしまうことを防ぎます。",
    "output": "en はフラグレジスタの書き込み許可です。この回路自体はフラグの値を保存しません。",
    "options": [
      {
        "port": "restore",
        "input": "restore はRETIによる保存フラグの復元要求です。",
        "process": "restore = H は通常の書き込みや kill より優先して復元を許可します。",
        "output": "sel はフラグの選択（0 ALU、1 保存したフラグ）です。"
      }
    ]
  },
  "ASPLIT": {
    "input": "addr はキャッシュで探す16 bitの語番地です。",
    "process": "addr[15:3]、addr[2:1]、addr[0]に配線を分けます。この構成は4行 × 2語のダイレクトマップなので、同じ行番号の番地は同じキャッシュ行を使います。",
    "output": "tag は上位13 bitで内容の一致確認、index は2 bitで行選択、offset は1 bitで行内の語選択に使います。このモジュールではデータを読みません。"
  },
  "CARRAY": {
    "input": "index は行番号、offset は行内の語番号です。fill は行の補充要求、ftag は保存するタグ、fline は主記憶から届く2語分（32 bit）です。",
    "process": "4行 × 2語を保持し、選択した行をクロックを待たずに読みます。fill = H の立ち上がりでその行を ftag・fline で置き換え、有効にします。探している番地とのタグ比較は別のCHITが行います。",
    "output": "valid は選んだ行の有効性、tag は保存タグ、data は offset で選んだ16 bitの語です。data はミスのときも出るため、使用可否はタグ比較と制御回路が判断します。",
    "options": [
      {
        "port": "upd",
        "input": "upd はヒットした語の更新許可、wd は新しい16 bitの値です。",
        "process": "fill がなければ、upd = H の立ち上がりで選んだ語だけを wd にします。タグと有効性は変えません。"
      },
      {
        "port": "inval",
        "input": "inval は命令キャッシュを無効にする要求です。",
        "process": "inval = H の立ち上がりでは、補充より優先して全行の有効ビットを消します。FENCEI後に命令を主記憶から読み直すためです。"
      }
    ]
  },
  "CHIT": {
    "input": "tag はアクセス番地のタグ、ctag は選んだキャッシュ行の保存タグ、valid はその行が有効かどうかです。",
    "process": "2つのタグを全ビット比較し、さらに valid = H であることを確認します。番号が一致しても、無効な行はヒットとして扱いません。",
    "output": "hit は valid AND (tag = ctag) です。Hならキャッシュ内の語を使用でき、Lなら制御回路が主記憶への要求などを判断します。"
  },
  "CCTRL": {
    "input": "req はキャッシュへのアクセス要求、hit はタグ比較の結果、ready は主記憶からの応答です。",
    "process": "要求がなければ待たず、読み出しヒットなら直ちに使用可能とします。読み出しミスなら1行を要求し、到着した行をキャッシュに保存するまで待たせます。制御出力は組み合わせ処理で決まり、ヒット・ミスの統計だけをクロックで記録します。",
    "output": "memReq は主記憶要求、fill は到着した行の保存指示、wait はCPUを待たせる信号です。読み出しミスでは ready = H で fill を出し、その立ち上がりで補充された後にヒットします。",
    "options": [
      {
        "port": "write",
        "input": "write はデータの書き込みアクセスです。",
        "process": "書き込みは常に主記憶へ送るライトスルー方式です。ヒットならキャッシュの語も更新し、ミスなら新しい行は確保しません。",
        "output": "memWe は主記憶への書き込み指定、upd は完了時にヒットした語を更新する指示です。"
      }
    ]
  },
  "ARB": {
    "input": "iReq・iAddr は命令側の要求と番地、dReq・dAddr・dWe・dWd はデータ側の要求・番地・書き込み指定・値です。ready は共有する主記憶の完了応答です。",
    "process": "共有バスを一方にだけ渡します。空きならデータ側を優先し、転送中は要求を保持する側に使用権を残します。使用権はクロックで記録し、完了すると解放します。これにより転送途中で別の要求の番地に切り替わることを防ぎます。",
    "output": "req・addr・we・wd を主記憶へ送り、ready を使用中の側の iReady または dReady にだけ返します。主記憶の読み出しデータ自体はこの回路を経由しません。"
  },
  "MAINMEM": {
    "input": "req は転送要求、addr は語番地、we は読み書きの区別、wd は書き込む16 bitの値です。バス調停回路が選んだ要求を1つ受け取ります。",
    "process": "512語を保持し、同じ要求を設定クロック数だけ待たせます。番地や読み書きの種類が変わると待ちを数え直します。読み出しは偶数番地からの2語をまとめ、書き込みは ready = H の立ち上がりで指定した1語だけを更新します。",
    "output": "ready は転送完了の合図、line は読み出した2語を詰めた32 bitです。下位16 bitが偶数番地、上位16 bitがその次の語です。待ち中や書き込み時の line は0です。"
  },
  "TD4IN": {
    "input": "回路からの入力端子はありません。画面の4つのスイッチが外部入力です。左から bit 3・2・1・0（重み8・4・2・1）です。",
    "process": "スイッチの状態を4 bitにまとめます。操作による変化はクロックを待たずに出力へ反映されます。CPUのレジスタに取り込まれるかどうかは、実行中の命令と後段の回路が決めます。",
    "output": "q が外部入力の4 bitです。MUXにつながり、IN命令などで選択されたときにALU側へ進みます。"
  },
  "TD4ROM": {
    "input": "addr はPCから届く4 bitの命令番地（0〜15）です。プログラムは16個の8 bit命令としてROMに保持されています。",
    "process": "addr の場所にある1命令を読み、上位4 bitと下位4 bitに分けます。読み出しにクロックは不要です。PCの新しい値が配線を通って addr に届くまでは、以前の番地を読み続けます。",
    "output": "op は上位4 bitのオペコードでDECODERへ、im は下位4 bitの即値でALUへ渡します。ROM自体は命令を実行せず、命令のビット列を供給します。"
  },
  "TD4DEC": {
    "input": "op はROMから届く4 bitのオペコード、cf は保存されたキャリーフラグです。即値やレジスタのデータはこの回路では扱いません。",
    "process": "op の上位2 bitから書き込み先、下位2 bitから通常の入力選択を求めます。PCへ書く命令ではMUXに0を選ばせ、即値をジャンプ先にします。JNCでは cf = L のときだけジャンプを許可します。",
    "output": "sel はMUXの選択（0 A、1 B、2 IN、3 定数0）、enA・enB・enOut は各レジスタの書き込み許可、jump は次PCをジャンプ先にする指示です。"
  },
  "TD4MUX": {
    "input": "a・b はA/Bレジスタの値、in は外部入力、sel はデコーダの選択番号です。各データは4 bitです。",
    "process": "sel が0なら a、1なら b、2なら in、3なら定数0を選びます。選択した値をそのまま通し、加算や保存はしません。MOVの即値設定などでは0を選び、ALUで即値だけを作れます。",
    "output": "y がALUへ渡す4 bitの値です。選択番号または選択中の入力が届くと更新されます。"
  },
  "TD4ALU": {
    "input": "x はMUXが選んだ4 bitの値、im はROMから届く4 bitの即値です。TD4では演算種別の入力はなく、常に加算します。",
    "process": "x + im を計算します。MOVでも入力に0を選んで加算を使います。たとえば15 + 1 = 16なら、下位4 bitは0000、5番目の桁は1になります。入力が届くたびに再計算し、結果は保存しません。",
    "output": "sum は下位4 bitの結果、cf は5番目の桁（キャリー）です。結果をどのレジスタへ保存するか、どのクロックで保存するかは、デコーダと各レジスタが決めます。"
  },
  "TD4NEXT": {
    "input": "pc はPCレジスタの4 bitの保存値、result はALUの結果、jump はデコーダのジャンプ指示です。",
    "process": "通常は pc + 1 を計算し、jump = H のときは result を選びます。番地は4 bitなので15の次は0です。JNCの条件判定は前段のデコーダが済ませています。",
    "output": "y は次にPCへ取り込ませる候補です。PCレジスタの d へ届いてもその場ではPCを変えず、次の立ち上がりで保存されます。"
  },
  "TD4OUT": {
    "input": "data はOUTレジスタから届く4 bitです。ALUの一時的な結果ではなく、OUTに保存された出力を受け取ります。",
    "process": "各ビットを対応するLEDの点灯に対応づけます。Hなら点灯、Lなら消灯です。この表示モジュールにはクロックで保存する状態はありません。",
    "output": "回路へ戻す出力端子はなく、LEDの点灯が観察できる結果です。左から bit 3・2・1・0（重み8・4・2・1）を表します。"
  }
};

const EXTRA_SIGNAL_DOC = {
  next: '次の状態番号（0 FETCH、1 DECODE、2 EXEC、3 ALUWB、4 MEM、5 MEMWB）',
  pcWrite: 'PCレジスタの書き込み許可',
  pcSel: '次PCの選択（0 ALU、1 ALUOUT、2 EPC、3 トラップベクタ）',
  maSel: 'メモリ番地の選択（0 PC、1 ALUOUT）',
  memReq: 'メモリへの読み書き要求',
  irWrite: '命令レジスタIRの書き込み許可',
  mdrWrite: '読み出しデータ用レジスタMDRの書き込み許可',
  aSel: 'ALUのA入力の選択（0 PC、1 保存したレジスタ値A）',
  bSel: 'ALUのB入力の選択（0 保存したレジスタ値B、1 即値、2 定数1）',
  outWrite: '演算結果レジスタALUOUTの書き込み許可',
  trap: 'トラップ情報の保存と停止状態の解除',
  br: '条件分岐の命令であること',
  jal: 'PC相対ジャンプの命令であること',
  jalr: 'レジスタを使う間接ジャンプの命令であること',
  link: '戻り番地PC+1を実行結果として選ぶ',
};

/** Variant-aware prose uses circuit parameters and port definitions only.
 * Current input/output/state values belong to the later live explanation. */
export function moduleGuide(m, t) {
  const guide = MODULE_GUIDES[m.type];
  if (!guide) return null;
  const ports = new Set(m.spec.ports.map(p => p.name));
  const args = [m.params.width, m.type === 'MUX' ? m.params.n : m.params.k ?? 1];
  const sections = Object.fromEntries(['input', 'process', 'output'].map(key => [key, [t(guide[key], ...args)]]));
  for (const extra of guide.options ?? []) if (ports.has(extra.port)) {
    for (const key of ['input', 'process', 'output']) if (extra[key]) sections[key].push(t(extra[key], ...args));
  }
  if (m.type === 'REGFILE' && m.params.bypass) sections.process.push(t("同じクロックで書き込むレジスタを読む場合は、書き込み値を直接読み出しへ回します (内部バイパス)。"));
  if (m.type === 'REG' && m.params.flags) sections.output.push(t("Z: 結果が0、C: 桁上がり (減算では借り)、N: 結果の最上位ビット (負)、V: 符号付きのあふれ。"));
  if (m.type === 'TLB' && m.params.kind === 'I') sections.process.push(t("命令TLBでは、要求時にエントリの実行許可 X を検査します。X がなければ fault = H です。"));
  if (m.type === 'PIPEREG' && Object.keys(m.params.consts ?? {}).length) {
    const constants = Object.entries(m.params.consts).map(([name, value]) => `${name} = ${formatValue(value, m.params.fields.find(([n]) => n === name)[1])}`).join(', ');
    sections.process.push(t("内部で固定する項目は {0} です。取り込み時にこの値を保存し、clr ではほかの項目とともに0にします。", constants));
  }
  const choices = m.type === 'MUX' ? Array.from({ length: m.params.n }, (_, i) => ({
    name: `sel = ${i}`,
    text: `${m.params.consts?.[i] !== undefined ? t("定数 {0}", formatValue(m.params.consts[i], m.params.width)) : `in${i}`}${m.params.names?.[i] ? ` (${m.params.names[i]})` : ''}`,
  })) : [];
  const signals = ['CONTROL', 'MCCTRL', 'UNPACK'].includes(m.type)
    ? m.spec.ports.filter(p => p.dir === 'out').map(p => ({ name: p.name, text: t(m.type === 'MCCTRL' && p.name === 'wbSel' ? "書き戻す値の選択（0 ALUOUT、1 MDR、2 PC（戻り番地）、3 CSR）" : SIGNAL_DOC[p.name] ?? EXTRA_SIGNAL_DOC[p.name] ?? p.name) })) : [];
  return { ...sections, choices, signals };
}
