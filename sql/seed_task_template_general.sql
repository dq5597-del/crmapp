-- ============================================================
-- 預載：標準施工範本（通用版）
-- 涵蓋場勘、拉線、安裝、設定整合、測試、教育訓練、驗收交付，
-- 適用於各類工程（影音／監控／廣播等），權重合計 100%。
-- 前置：sql/project_tasks.sql（project_task_templates / project_task_template_items）
-- 執行位置：Supabase Dashboard → SQL Editor（可重複執行，不會產生重複資料）
-- ============================================================

insert into public.project_task_templates (name, category, description)
select '標準施工範本', '通用工程',
       '通用型施工流程範本：場勘、拉線、安裝、設定整合、測試、教育訓練、驗收交付，權重合計100%，可依專案類型微調工項與工期'
where not exists (
  select 1 from public.project_task_templates where name = '標準施工範本'
);

insert into public.project_task_template_items (template_id, seq_no, task_name, weight, default_days, notes)
select t.id, v.seq, v.nm, v.w, v.d, v.nt
from public.project_task_templates t
cross join (values
  (1, '場勘與場地確認',       5::numeric, 1, '確認現場環境、電源、動線、與客戶最終需求對焦'),
  (2, '拉線與管路施作',       20::numeric, 3, '弱電/強電配線、穿管、線槽、線路標示'),
  (3, '設備安裝與上架',       25::numeric, 3, '主機櫃整線、機櫃、壁掛架、螢幕/攝影機/喇叭等設備定位安裝'),
  (4, '系統設定與整合',       20::numeric, 2, '韌體設定、網路/IP規劃、各系統串接'),
  (5, '系統測試與除錯',       15::numeric, 2, '訊號/聲音/影像逐項壓測、壓力測試、校正聲場/畫面、異常排除'),
  (6, '教育訓練與操作指導',   5::numeric, 1, '終端使用者操作教學、簡易故障排除 SOP 移交給使用單位'),
  (7, '竣工交付與正式驗收',   10::numeric, 1, '客戶會同驗收、交付竣工圖資/線位表/保固書、簽署驗收單、保固說明')
) as v(seq, nm, w, d, nt)
where t.name = '標準施工範本'
  and not exists (
    select 1 from public.project_task_template_items i where i.template_id = t.id
  );

notify pgrst, 'reload schema';
