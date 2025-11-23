# Tournament Test Scenarios

## Test Senaryoları - Turnuva Sistemleri

### 1. 4 Oyuncu - Çift Eleme (Single Elimination)
**Oyuncular:** P1, P2, P3, P4

**Bracket Yapısı:**
```
Round 1:
  Match 1: P1 vs P2
  Match 2: P3 vs P4

Round 2 (Final):
  Match 3: Winner(M1) vs Winner(M2)
```

**Test Adımları:**
1. ✅ 4 oyuncu lobby'ye katılsın
2. ✅ Host turnuvayı başlatsın (Single Elimination, 5 round)
3. ✅ Round 1 - İki maç paralel başlasın
4. ✅ Her iki maç da tamamlansın (decision reversal test et)
5. ✅ 10 saniye bekleme sonrası Round 2 başlasın
6. ✅ Final maçı tamamlansın
7. ✅ Tournament sonuç ekranı görünsün
8. ✅ Tüm oyuncular için doğru rankings, stats, cooperation rate görünsün

**Beklenen Sonuç:**
- 2 maç Round 1, 1 maç Final
- Kazanan rank 1, finalist rank 2, elenenler rank 3-4
- İşbirliği oranları doğru hesaplansın

---

### 2. 8 Oyuncu - Çift Eleme (Single Elimination)
**Oyuncular:** P1, P2, P3, P4, P5, P6, P7, P8

**Bracket Yapısı:**
```
Round 1 (Quarterfinals):
  Match 1: P1 vs P2
  Match 2: P3 vs P4
  Match 3: P5 vs P6
  Match 4: P7 vs P8

Round 2 (Semifinals):
  Match 5: Winner(M1) vs Winner(M2)
  Match 6: Winner(M3) vs Winner(M4)

Round 3 (Final):
  Match 7: Winner(M5) vs Winner(M6)
```

**Test Adımları:**
1. ✅ 8 oyuncu lobby'ye katılsın
2. ✅ Host turnuvayı başlatsın (Single Elimination, 5 round)
3. ✅ Round 1 - 4 maç paralel başlasın
4. ✅ Tüm maçlar tamamlansın
5. ✅ 10 saniye bekleme sonrası Round 2 başlasın (2 maç)
6. ✅ Semifinal maçları tamamlansın
7. ✅ 10 saniye bekleme sonrası Final başlasın
8. ✅ Final tamamlansın
9. ✅ Tournament sonuç ekranı - 8 oyuncu için rankings

**Beklenen Sonuç:**
- 4 + 2 + 1 = 7 toplam maç
- Kazanan rank 1, finalist rank 2, semifinalistler rank 3-4, quarterfinal elenenleri rank 5-8
- Her oyuncu için stats doğru

**Özel Test Durumları:**
- Bir maçta tie olursa random winner seçilsin
- Decision reversal approved olursa tournament ilerlesin
- Bir oyuncu disconnect olursa forfeit

---

### 3. 16 Oyuncu - Çift Eleme (Single Elimination)
**Oyuncular:** P1-P16

**Bracket Yapısı:**
```
Round 1: 8 maç (16 → 8)
Round 2: 4 maç (8 → 4)
Round 3: 2 maç (4 → 2)
Round 4: 1 maç (2 → 1)
```

**Test Adımları:**
1. ✅ 16 oyuncu lobby'ye katılsın
2. ✅ Host turnuvayı başlatsın
3. ✅ Round 1 - 8 maç paralel başlasın
4. ✅ Tüm maçlar tamamlansın, 10 saniye bekle
5. ✅ Round 2 - 4 maç başlasın
6. ✅ Tüm maçlar tamamlansın, 10 saniye bekle
7. ✅ Round 3 - 2 maç başlasın
8. ✅ Tüm maçlar tamamlansın, 10 saniye bekle
9. ✅ Round 4 - Final başlasın
10. ✅ Final tamamlansın
11. ✅ Tournament sonuç ekranı - 16 oyuncu rankings

**Beklenen Sonuç:**
- 8 + 4 + 2 + 1 = 15 toplam maç
- Tüm oyuncular için doğru rankings (1-16)
- Performance stats doğru hesaplansın

---

### 4. Tek Sayıda Oyuncu - Bye Sistemi
**Oyuncular:** P1, P2, P3, P4, P5 (5 oyuncu)

**Bracket Yapısı:**
```
Round 1:
  Match 1: P1 vs P2
  Match 2: P3 vs P4
  P5: BYE (otomatik geçiş)

Round 2:
  Match 3: Winner(M1) vs Winner(M2)
  P5: BYE (otomatik geçiş)

Round 3 (Final):
  Match 4: Winner(M3) vs P5
```

**Test Adımları:**
1. ✅ 5 oyuncu lobby'ye katılsın
2. ✅ Host turnuvayı başlatsın
3. ✅ Round 1 - 2 maç başlasın, P5 beklesin
4. ✅ Maçlar tamamlansın
5. ✅ Round 2 - 1 maç başlasın, P5 hala beklesin
6. ✅ Maç tamamlansın
7. ✅ Final - Winner vs P5 başlasın
8. ✅ Final tamamlansın

**Beklenen Sonuç:**
- P5 hiç maç yapmadan finale gelmeli
- P5'in stats'i 0 olmalı (maç yapmadı)
- Final sonrası doğru rankings

---

### 5. Decision Reversal Senaryoları

**Test Case 5.1: Her İki Oyuncu Kabul Eder**
1. ✅ Maç bitsin
2. ✅ Her iki oyuncu "Kabul Et" seçsin
3. ✅ Round selection ekranı gelsin
4. ✅ Oyuncular farklı roundları değiştirsin
5. ✅ Final skorlar güncellensin
6. ✅ Tournament ilerlesin

**Test Case 5.2: Bir Oyuncu Reddeder**
1. ✅ Maç bitsin
2. ✅ P1 "Kabul Et", P2 "Reddet" seçsin
3. ✅ İstatistik ekranı gelsin
4. ✅ Tournament ilerlesin (reversal olmadan)

**Test Case 5.3: Tie Sonrası Reversal**
1. ✅ Maç 14-14 tie bitsin
2. ✅ Random winner seçilsin
3. ✅ Reversal approved olursa
4. ✅ Yeni skorlar hesaplansın
5. ✅ Tournament ilerlesin

---

### 6. Edge Cases

**Test Case 6.1: Disconnect During Match**
1. ✅ Maç başlasın
2. ✅ Bir oyuncu disconnect olsun
3. ✅ Diğer oyuncu forfeit win alsın
4. ✅ Tournament ilerlesin

**Test Case 6.2: All Cooperate Match**
1. ✅ Tüm roundlarda her iki oyuncu cooperate seçsin
2. ✅ Cooperation rate %100 olsun
3. ✅ Stats doğru hesaplansın

**Test Case 6.3: All Betray Match**
1. ✅ Tüm roundlarda her iki oyuncu betray seçsin
2. ✅ Cooperation rate %0 olsun
3. ✅ Stats doğru hesaplansın

**Test Case 6.4: Multiple Ties in Tournament**
1. ✅ Birden fazla maç tie bitsin
2. ✅ Her tie için random winner seçilsin
3. ✅ Tournament düzgün ilerlesin

---

## Otomatik Test Script

```javascript
// Test helper functions
async function simulateMatch(matchId, p1Decisions, p2Decisions) {
  for (let round = 0; round < 5; round++) {
    await sendDecision(matchId, 'player1', p1Decisions[round]);
    await sendDecision(matchId, 'player2', p2Decisions[round]);
    await waitForRoundResult();
  }
}

async function testSingleElimination4Players() {
  console.log('🧪 Testing 4-player Single Elimination...');
  
  // Create lobby
  const lobby = await createLobby(4, 'single_elimination');
  
  // Add 4 players
  await addPlayers(lobby, ['P1', 'P2', 'P3', 'P4']);
  
  // Start tournament
  await startTournament(lobby);
  
  // Round 1 - Match 1: P1 vs P2
  await simulateMatch('match_0_0', 
    ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
    ['BETRAY', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
  );
  
  // Round 1 - Match 2: P3 vs P4
  await simulateMatch('match_0_1',
    ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
    ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
  );
  
  // Wait for round completion
  await wait(10000);
  
  // Final: Winner1 vs Winner2
  await simulateMatch('match_1_0',
    ['COOPERATE', 'BETRAY', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
    ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
  );
  
  // Verify results
  const results = await getTournamentResults(lobby);
  assert(results.winner, 'Tournament should have a winner');
  assert(results.players.length === 4, 'Should have 4 players');
  assert(results.players.every(p => p.currentRank > 0), 'All players should have ranks');
  
  console.log('✅ 4-player test passed!');
}

// Run all tests
async function runAllTests() {
  await testSingleElimination4Players();
  await testSingleElimination8Players();
  await testSingleElimination16Players();
  await testByeSystem();
  await testDecisionReversal();
  await testEdgeCases();
  
  console.log('🎉 All tests passed!');
}
```

---

## Manuel Test Checklist

### Pre-Tournament
- [ ] Lobby oluşturma çalışıyor
- [ ] Oyuncular katılabiliyor
- [ ] Settings değiştirilebiliyor
- [ ] Host turnuvayı başlatabiliyor

### During Tournament
- [ ] Maçlar doğru eşleşmelerle başlıyor
- [ ] Timer çalışıyor
- [ ] Decisions kaydediliyor
- [ ] Round results doğru hesaplanıyor
- [ ] Decision reversal çalışıyor
- [ ] İstatistik ekranı 10 saniye görünüyor
- [ ] Bir sonraki round başlıyor

### Post-Tournament
- [ ] Final rankings doğru
- [ ] Player statistics doğru (matches, points, cooperation rate)
- [ ] "Sizin Performansınız" tüm oyuncular için görünüyor
- [ ] Dark tema uyumlu
- [ ] Bracket görünümü doğru

### Error Handling
- [ ] Disconnect handling
- [ ] Timeout handling
- [ ] Tie handling
- [ ] Invalid decision handling

---

## Performance Metrics

**Hedef Performans:**
- Maç başlatma: < 2 saniye
- Round result hesaplama: < 500ms
- Tournament advancement: < 1 saniye
- Statistics calculation: < 1 saniye

**Scalability:**
- 4 oyuncu: Sorunsuz
- 8 oyuncu: Sorunsuz
- 16 oyuncu: Test edilmeli
- 32+ oyuncu: Optimize edilmeli

---

## Known Issues & Limitations

1. ✅ **FIXED:** İstatistik skorları yanlış hesaplanıyordu
2. ✅ **FIXED:** Decision reversal sonrası tournament ilerlemiyordu
3. ✅ **FIXED:** Tie durumunda tournament takılıyordu
4. ✅ **FIXED:** İkinci faza geçerken oyuncular maça geçemiyordu
5. ✅ **FIXED:** İşbirliği oranı hesaplanmıyordu
6. ✅ **FIXED:** Tournament sonuç ekranı light tema idi
7. ✅ **FIXED:** "Sizin Performansınız" sadece bir oyuncuda görünüyordu

**Remaining:**
- Guest player database save (şu an skip ediliyor)
- MCP tournament results API endpoint (404 hatası)

---

## Success Criteria

✅ **Tüm test senaryoları başarılı olmalı**
✅ **Hiçbir oyuncu stuck kalmamalı**
✅ **Statistics doğru hesaplanmalı**
✅ **UI responsive ve kullanıcı dostu olmalı**
✅ **Error handling robust olmalı**
