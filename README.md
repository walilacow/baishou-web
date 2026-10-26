# 百獸真經（網頁版・測試版）

武俠卡牌對戰《百獸真經》的網頁版，小盜工作室（EngieStudio）出品。**這是測試中的版本，規則與數值可能隨時調整，進度可能不保留。**

- 一般對戰：選門派，對上電腦。
- 劇情模式：序章加八關，共九場，進度存在瀏覽器（localStorage）。
- 規則頁：`rules.html`（建置時由遊戲規則文件自動產生）。

## 怎麼運作

遊戲引擎是同一份 Swift 程式（與 iOS／Mac 版共用），用 SwiftWasm 編成 WebAssembly 在瀏覽器裡執行；前端是純 JavaScript，沒有伺服器、不需要登入、不收集任何資料。

這個 repo 只放建置後的網頁（HTML／JS／wasm／圖片／資料），不含遊戲引擎原始碼。

## 版本與來源

- 網頁版版號：測試版 0.1.1（Build 1）。
- 劇情模式的組局與獎勵邏輯，來源是 iOS／Mac 試玩版 0.2.7（Build 57）的 CampaignRun；遊戲規則本身都在共用的引擎裡，只有這段組裝是兩份。
- 規則頁由規則文件在建置時自動產生。

## 授權

© 2026 小盜工作室（EngieStudio）版權所有。All rights reserved. 詳見 `LICENSE`。

問題回報：walilacow.hu@gmail.com
