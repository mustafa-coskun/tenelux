# Manual Test Checklist - Tournament System

## ✅ Tamamlanan Düzeltmeler

- [x] İstatistik skorları düzeltildi
- [x] Decision reversal tournament ilerlemesi
- [x] Tie handling (random winner)
- [x] Phase transitions (match→tournament→match)
- [x] 10 saniye bekleme süresi
- [x] Final rankings
- [x] Player statistics (cooperation rate)
- [x] TOURNAMENT_MATCH_READY sadece maçtaki oyunculara
- [x] Dark tema
- [x] Player highlighting (name-based)
- [x] Auto-leave from previous lobby
- [x] Duplicate "Pes Et" button removed

---

## 📋 Test Scenario 1: 4 Oyuncu - Çift Eleme

### Setup
- [ ] Server çalıştır: `npm start`
- [ ] 4 tarayıcı penceresi aç (veya 4 farklı cihaz)

### Test Adımları

#### 1. Lobby Oluşturma
- [ ] P1: "Party Mode" → "Create Lobby"
- [ ] Settings: Max 4 players, 5 rounds, Single Elimination
- [ ] Lobby code görünüyor mu? ✓
- [ ] P1 host olarak işaretli mi? ✓

#### 2. Oyuncular Katılsın
- [ ] P2: Lobby code ile katıl
- [ ] P3: Lobby code ile katıl
- [ ] P4: Lobby code ile katıl
- [ ] Tüm oyuncular lobby'de görünüyor mu? ✓
- [ ] Player count: 4/4 ✓

#### 3. Tournament Başlat
- [ ] P1: "Start Tournament" butonu aktif mi? ✓
- [ ] P1: Tournament başlat
- [ ] Tüm oyuncular "Tournament Started" mesajı aldı mı? ✓

#### 4. Round 1 - Match 1 (P1 vs P2)
- [ ] P1 ve P2 maç ekranına geçti mi? ✓
- [ ] Opponent isimleri doğru mu? ✓
- [ ] Timer çalışıyor mu? ✓
- [ ] 5 round oyna
- [ ] Her round sonrası skor güncelleniyor mu? ✓
- [ ] Game Over ekranı geldi mi? ✓

#### 5. Decision Reversal (Match 1)
- [ ] Her iki oyuncu reversal seçeneği gördü mü? ✓
- [ ] P1: "Reddet" seç
- [ ] P2: "Reddet" seç
- [ ] İstatistik ekranı geldi mi? ✓
- [ ] Skorlar doğru mu? ✓
- [ ] Cooperation rate hesaplandı mı? ✓

#### 6. Round 1 - Match 2 (P3 vs P4)
- [ ] P3 ve P4 maç ekranına geçti mi? ✓
- [ ] 5 round oyna
- [ ] Decision reversal test et (biri kabul, biri red)
- [ ] İstatistik ekranı geldi mi? ✓

#### 7. 10 Saniye Bekleme
- [ ] İstatistik ekranı 10 saniye görünüyor mu? ✓
- [ ] Countdown timer var mı? ✓

#### 8. Round 2 - Final
- [ ] 10 saniye sonra otomatik geçiş oldu mu? ✓
- [ ] Kazananlar final maçına geçti mi? ✓
- [ ] Elenler spectator modda mı? ✓
- [ ] Final maçı oyna
- [ ] Decision reversal test et (her ikisi kabul)
- [ ] Round selection ekranı geldi mi? ✓
- [ ] Farklı roundları değiştir
- [ ] Skorlar güncellendi mi? ✓

#### 9. Tournament Sonuç Ekranı
- [ ] Tüm oyuncular sonuç ekranını gördü mü? ✓
- [ ] Winner doğru mu? ✓
- [ ] Rankings doğru mu? (1-4) ✓
- [ ] Player statistics doğru mu? ✓
  - [ ] Matches played ✓
  - [ ] Matches won/lost ✓
  - [ ] Total points ✓
  - [ ] Cooperation rate ✓
- [ ] "Sizin Performansınız" tüm oyuncular için görünüyor mu? ✓
- [ ] Kendi ranking'i highlight edilmiş mi? ✓
- [ ] Dark tema uyumlu mu? ✓

#### 10. Yeni Tournament
- [ ] "Lobby'ye Dön" butonu çalışıyor mu? ✓
- [ ] Oyuncular yeni lobby oluşturabiliyor mu? ✓
- [ ] Eski lobby'den otomatik çıkış yapıldı mı? ✓

---

## 📋 Test Scenario 2: 8 Oyuncu - Çift Eleme

### Setup
- [ ] 8 tarayıcı penceresi aç

### Test Adımları

#### 1. Lobby & Start
- [ ] 8 oyuncu lobby'ye katılsın
- [ ] Tournament başlat
- [ ] 4 maç paralel başladı mı? ✓

#### 2. Round 1 (Quarterfinals)
- [ ] 4 maç tamamlansın
- [ ] Her maç için decision reversal test et
- [ ] İstatistikler doğru mu? ✓

#### 3. Round 2 (Semifinals)
- [ ] 10 saniye bekleme ✓
- [ ] 2 maç başladı mı? ✓
- [ ] Doğru oyuncular eşleşti mi? ✓
- [ ] Maçları tamamla

#### 4. Round 3 (Final)
- [ ] 10 saniye bekleme ✓
- [ ] Final başladı mı? ✓
- [ ] Final tamamla

#### 5. Sonuç Ekranı
- [ ] 8 oyuncu için rankings doğru mu? ✓
- [ ] Stats doğru mu? ✓

---

## 📋 Test Scenario 3: Edge Cases

### Test 3.1: Tie Durumu
- [ ] Maç 14-14 tie bitsin
- [ ] Random winner seçildi mi? ✓
- [ ] Tournament ilerliyor mu? ✓

### Test 3.2: All Cooperate
- [ ] Tüm roundlarda cooperate seç
- [ ] Cooperation rate %100 mü? ✓

### Test 3.3: All Betray
- [ ] Tüm roundlarda betray seç
- [ ] Cooperation rate %0 mı? ✓

### Test 3.4: Reversal Approved
- [ ] Her iki oyuncu "Kabul Et" seçsin
- [ ] Round selection ekranı geldi mi? ✓
- [ ] Farklı roundları değiştir
- [ ] Skorlar güncellendi mi? ✓
- [ ] Tournament ilerliyor mu? ✓

### Test 3.5: Disconnect
- [ ] Maç sırasında bir oyuncu disconnect olsun
- [ ] Diğer oyuncu forfeit win aldı mı? ✓
- [ ] Tournament ilerliyor mu? ✓

### Test 3.6: Forfeit
- [ ] "Pes Et" butonuna tıkla
- [ ] Sadece bir buton var mı? (altta) ✓
- [ ] Forfeit işlendi mi? ✓
- [ ] Rakip win aldı mı? ✓

### Test 3.7: Lobby Auto-Leave
- [ ] Bir tournament tamamla
- [ ] Yeni lobby oluştur
- [ ] Eski lobby'den otomatik çıkış yapıldı mı? ✓
- [ ] "Already in lobby" hatası yok mu? ✓

---

## 🎯 Success Criteria

### Functionality
- [ ] Tüm maçlar başlıyor
- [ ] Skorlar doğru hesaplanıyor
- [ ] Decision reversal çalışıyor
- [ ] Tournament ilerliyor
- [ ] Sonuç ekranı doğru

### Performance
- [ ] Maç başlatma < 2 saniye
- [ ] Round result < 500ms
- [ ] Tournament advancement < 1 saniye
- [ ] No lag or freezing

### UI/UX
- [ ] Dark tema tutarlı
- [ ] Butonlar responsive
- [ ] Timer senkronize
- [ ] Mesajlar anlaşılır
- [ ] Hata mesajları yardımcı

### Error Handling
- [ ] Disconnect gracefully handled
- [ ] Timeout handled
- [ ] Invalid input rejected
- [ ] Network errors recovered

---

## 📊 Test Results

### Date: _____________
### Tester: _____________

| Scenario | Status | Notes |
|----------|--------|-------|
| 4 Player Tournament | ⬜ | |
| 8 Player Tournament | ⬜ | |
| Tie Handling | ⬜ | |
| All Cooperate | ⬜ | |
| All Betray | ⬜ | |
| Reversal Approved | ⬜ | |
| Disconnect | ⬜ | |
| Forfeit | ⬜ | |
| Auto-Leave | ⬜ | |

### Overall Result: ⬜ PASS / ⬜ FAIL

### Issues Found:
1. 
2. 
3. 

### Recommendations:
1. 
2. 
3. 

---

## 🚀 Automated Test

Test script hazır: `tournament-test-runner.js`

### Çalıştırma:
```bash
# Server'ı başlat
npm start

# Başka bir terminal'de test'i çalıştır
node tournament-test-runner.js
```

### Test Coverage:
- ✅ 4-Player Single Elimination
- ✅ 8-Player Single Elimination
- ⏳ 16-Player (TODO)
- ⏳ Bye System (TODO)
- ⏳ Decision Reversal Scenarios (TODO)

---

## 📝 Notes

- Server port: 3001
- WebSocket endpoint: ws://localhost:3001
- Test duration: ~5-10 minutes per scenario
- Recommended: Test on different browsers (Chrome, Firefox, Safari)
- Recommended: Test on mobile devices
