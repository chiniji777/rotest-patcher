ROTest Patcher

รุ่น 1.1 ภาษาไทย: แตก ZIP ทับเฉพาะ ROTest Patcher.exe ในโฟลเดอร์ ROTest เดิม
ปิด Patcher ก่อนเปลี่ยนไฟล์ และปิดเกม ROTest ก่อนกดอัปเดตไฟล์เกม
Patcher รุ่นเดิมไม่อัปเดตตัวโปรแกรมเอง ต้องเปลี่ยน EXE ครั้งเดียวเพื่อรับหน้าจอภาษาไทย
แพตช์ภาษาไทยปรับการแสดงข้อความ ไม่เปลี่ยน ROTest.exe หรือเกม FINN
NPC ทดสอบใหม่อยู่ Morroc บริเวณ 151–163,94: เพิ่มเลเวล/จ็อบ, เปลี่ยนอาชีพ,
ร้านค้า, วาร์ป และเปิด/ปิด WoE FE สำหรับ GM ระดับ 99
สนาม GvG ใช้ได้ตลอดโดยไม่ขึ้นกับสถานะ WoE
ข้อความ NPC ใหม่และหน้าจอ Patcher เป็นภาษาไทย ชื่อสกิล/ไอเทม/แมพคงชื่อเดิม
เมนูเก่าบางส่วนของไคลเอนต์ยังไม่ได้แปลไทย
แก้ข้อสรุป 1.1.1: ผลทดสอบใหม่ใช้ langtype=5 กับ EXE เดิม เข้าเลือกตัวละครและ Morroc ได้
ข้อความ NPC ไทยแสดงถูกต้อง การทดสอบเดิมมีเวลารอระหว่างขั้นจนหมดช่วงยืนยันตัว 30 วินาที
รุ่น 1.2 คืน langtype=5 โดยไม่เปลี่ยน EXE; หลังล็อกอินให้เลือกเซิร์ฟเวอร์ต่อเนื่อง
ปุ่ม/ภาพและเมนูเก่าบางส่วนยังเป็นอังกฤษหรือเกาหลี ไม่ได้แปลไคลเอนต์ทั้งเกม

Windows x64 updater for the existing ROTest-20211103-candidate1 client.
This repository does not include the full Ragnarok game, user accounts or credentials.

Use:
Extract the self-contained Windows release next to ROTest.exe, then run ROTest Patcher.exe.
If located elsewhere, select the folder containing the original ROTest.exe.
The patcher checks signed updates automatically when opened. Close ROTest before updating.
Start game / Graphics setup become available after a verified update check.
Restore previous retains backups and pauses that release until Check / Update is chosen.
No administrator rights should be needed when the game folder is writable by its owner.
The initial binary does not have a purchased Authenticode certificate. Never disable antivirus.

Security and boundaries:
- RSA-PSS SHA-256 signed manifest; SHA-256 and byte count for every downloaded file.
- Only versioned HTTPS assets from this repository are accepted.
- No archive extraction from remote payloads; only individually validated game-relative files.
- Reject traversal, ADS, Windows device names, duplicate destinations and linked directories.
- Verify the original ROTest.exe fingerprint; refuse FINN or unrelated game folders.
- Retain transaction backups and recover interrupted installs; preserve unrecognized manual edits.
- The current patcher updates data/System files and OpenSetup, not itself or ROTest.exe.
- Keep .rotest-patcher backups until an update has been accepted. Logs are under LocalAppData/ROTestPatcher.

Development:
dotnet run --project tests/ROTest.Patcher.Tests
dotnet publish src/ROTest.Patcher.Windows -c Release -r win-x64 --self-contained true

Publishing:
The private release key is held outside the repository on the owner's workstation.
node tools/release.mjs <ro-test-rathena folder> <vX.Y.Z> <sequence> <private-key-path>
Publish every generated asset and channel.json to that immutable GitHub release tag.
The patcher resolves releases/latest/download/channel.json; no GitHub token is distributed.
Review and test changed client files before signing a release. No password files belong in assets.

Third-party notices:
OpenSetup (Lua) 3.5.0.692 by Ai4rei/AN is supplied with its CC BY-NC 4.0 notice and dependency licenses.
https://nn.ai4rei.net/dev/opensetup/
English client data originates from llchrisll/ROenglishRE, based on work by zackdreaver.
https://github.com/llchrisll/ROenglishRE
The skill callback compatibility patch retains Pre-Renewal gameplay; it is not a server balance update.
Ragnarok Online and its assets remain the property of their respective rights holders.
ROTest is an independent temporary test environment, not an official Gravity service.

Verification limits:
Updater tests do not establish full game skill/action coverage or FINN Assassin Trainer compatibility.
