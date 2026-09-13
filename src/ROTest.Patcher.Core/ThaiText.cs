namespace ROTest.Patcher.Core;
public static class ThaiText
{
    public static string Translate(string text)
    {
        foreach(var (prefix,thai) in new[]{("Downloading ","กำลังดาวน์โหลด "),("Installing ","กำลังติดตั้ง "),("Downloaded file failed verification: ","ไฟล์ที่ดาวน์โหลดไม่ผ่านการตรวจสอบ: "),("Manual changes found; recovery stopped without overwriting them: ","พบไฟล์ที่แก้ไขเอง จึงหยุดกู้คืนเพื่อไม่ทับงาน: "),("Recovery backup is missing or damaged: ","ไฟล์สำรองหายหรือเสียหาย: ")})
            if(text.StartsWith(prefix,StringComparison.Ordinal))return thai+text[prefix.Length..];
        return text switch
        {
            "Close ROTest before updating or restoring files."=>"กรุณาปิด ROTest ก่อนอัปเดตหรือกู้คืนไฟล์",
            "Recovering interrupted update..."=>"กำลังกู้คืนการอัปเดตที่ค้างอยู่...",
            "Choose the original ROTest client folder, not FINN or another game."=>"กรุณาเลือกโฟลเดอร์ ROTest เดิม ไม่ใช่ FINN หรือเกมอื่น",
            "Update signature is invalid. No files were installed."=>"ลายเซ็นแพตช์ไม่ถูกต้อง จึงยังไม่ติดตั้งไฟล์ใด",
            "An older release was offered. Update refused."=>"พบแพตช์รุ่นเก่ากว่าที่เคยติดตั้ง จึงหยุดอัปเดต",
            "No completed update is available to restore."=>"ยังไม่มีการอัปเดตที่เสร็จแล้วให้กู้คืน",
            "Unsupported update manifest."=>"ไม่รองรับข้อมูลแพตช์ชุดนี้",
            "Update download is not from the approved release repository."=>"ที่อยู่ดาวน์โหลดไม่ใช่แหล่งแพตช์ที่อนุญาต",
            _=>text
        };
    }
}
