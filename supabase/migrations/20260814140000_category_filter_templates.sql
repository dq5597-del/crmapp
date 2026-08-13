-- 產品篩選器：依產品小類套用可重用模板。
create table if not exists public.product_filter_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_filter_template_groups (
  template_id uuid not null references public.product_filter_templates(id) on delete cascade,
  group_id uuid not null references public.product_filter_groups(id) on delete cascade,
  sort_order integer not null default 0,
  is_required boolean not null default false,
  primary key (template_id, group_id)
);

create table if not exists public.product_category_filter_templates (
  category_id uuid not null references public.product_categories(id) on delete cascade,
  template_id uuid not null references public.product_filter_templates(id) on delete cascade,
  primary key (category_id, template_id)
);

create index if not exists idx_filter_template_groups_group on public.product_filter_template_groups(group_id);
create index if not exists idx_category_filter_templates_template on public.product_category_filter_templates(template_id);

alter table public.product_filter_templates enable row level security;
alter table public.product_filter_template_groups enable row level security;
alter table public.product_category_filter_templates enable row level security;
grant select, insert, update, delete on public.product_filter_templates, public.product_filter_template_groups, public.product_category_filter_templates to authenticated;
grant all on public.product_filter_templates, public.product_filter_template_groups, public.product_category_filter_templates to service_role;

drop policy if exists product_filter_templates_auth_all on public.product_filter_templates;
create policy product_filter_templates_auth_all on public.product_filter_templates for all to authenticated using (true) with check (true);
drop policy if exists product_filter_template_groups_auth_all on public.product_filter_template_groups;
create policy product_filter_template_groups_auth_all on public.product_filter_template_groups for all to authenticated using (true) with check (true);
drop policy if exists product_category_filter_templates_auth_all on public.product_category_filter_templates;
create policy product_category_filter_templates_auth_all on public.product_category_filter_templates for all to authenticated using (true) with check (true);

insert into public.product_filter_templates (name, slug, sort_order)
values
  ('混音器','mixer',10), ('音訊處理器','audio_dsp',20), ('錄音／音訊介面','audio_interface',30),
  ('擴大機','amplifier',40), ('喇叭','loudspeaker',50), ('麥克風','microphone',60),
  ('行動擴音','portable_pa',70), ('音源／廣播排程','media_player_paging',80), ('卡拉 OK 點歌機','karaoke_player',90),
  ('PTZ／IP 攝影機','camera_ptz_ip',100), ('影音矩陣／路由','video_router',110), ('擷取／串流／導播','video_capture_stream',120),
  ('媒體儲存／NVR','media_storage_nvr',130), ('投影機','projector',140), ('商用顯示／觸控／LED','commercial_display',150),
  ('投影幕','projection_screen',160), ('網路交換器／AP','network_switch',170), ('電腦／儲存','computer_storage',180),
  ('UPS／PDU','ups_pdu',190), ('電源時序／濾波','rack_power',200), ('線材／轉接／延長','cable_adapter_extender',210),
  ('顯示器支架','display_mount',220), ('機櫃／安裝配件','rack_mount_accessory',230),
  ('環控主機／閘道','control_processor_gateway',240), ('環控面板','control_panel',250), ('環境感測器','environment_sensor',260),
  ('建築控制設備','building_actuator',270), ('燈具','lighting_fixture',280), ('燈光控制','lighting_control',290)
on conflict (slug) do update set name=excluded.name, sort_order=excluded.sort_order, is_active=true;

with seed(name,slug,input_type,unit,sort_order) as (values
  ('擴大機用途','amplifier_application','multi_select',null,10), ('額定功率基準','power_basis','multi_select',null,11),
  ('額定輸出功率','rated_power_w','number','W/聲道',12), ('額定負載阻抗','rated_load_ohm','number','Ω',13),
  ('定壓輸出制式','constant_voltage_mode','multi_select',null,14), ('輸出聲道數','amp_output_channel_count','number','聲道',15),
  ('分區數','zone_count','number','區',16), ('麥克風輸入數','mic_input_count','number','孔',17),
  ('輸入介面','input_interface','multi_select',null,18), ('輸出介面','output_interface','multi_select',null,19),
  ('主動／被動','powered_type','multi_select',null,20), ('喇叭類型','speaker_type','multi_select',null,21),
  ('單體尺寸','driver_size_in','number','吋',22), ('連續功率','continuous_power_w','number','W',23),
  ('峰值功率','peak_power_w','number','W',24), ('標稱阻抗','nominal_impedance_ohm','number','Ω',25),
  ('最大音壓','max_spl_db','number','dB',26), ('安裝方式','mounting','multi_select',null,27),
  ('傳輸方式','transmission_type','multi_select',null,30), ('麥克風外型','mic_form','multi_select',null,31),
  ('換能器類型','transducer_type','multi_select',null,32), ('指向性','polar_pattern','multi_select',null,33),
  ('無線聲道數','wireless_channel_count','number','聲道',34), ('RF 頻段下限','rf_band_min_mhz','number','MHz',35),
  ('RF 頻段上限','rf_band_max_mhz','number','MHz',36), ('工作距離','operating_range_m','number','m',37),
  ('電池續航','battery_runtime_h','number','小時',38), ('混音器類型','mixer_type','multi_select',null,40),
  ('混音輸入聲道','mixing_input_channel_count','number','聲道',41), ('麥克風前級數','mic_preamp_count','number','組',42),
  ('類比輸出數','analog_output_count','number','孔',43), ('Bus 數','bus_count','number','組',44), ('Matrix 數','matrix_count','number','組',45),
  ('網路音訊協定','network_audio_protocol','multi_select',null,46), ('錄音介面','recording_interface','multi_select',null,47),
  ('類比輸入數','analog_input_count','number','孔',50), ('DSP 聲道數','dsp_channel_count','number','聲道',51),
  ('控制協定','control_protocol','multi_select',null,52), ('AEC 回音消除','aec_support','multi_select',null,53),
  ('回授抑制','feedback_suppression','multi_select',null,54), ('主機介面','host_interface','multi_select',null,55),
  ('Line 輸入數','line_input_count','number','孔',56), ('Line 輸出數','line_output_count','number','孔',57),
  ('同步輸入數','simultaneous_input_count','number','聲道',58), ('同步輸出數','simultaneous_output_count','number','聲道',59),
  ('位元深度','bit_depth','multi_select',null,60), ('取樣率','sample_rate_khz','number','kHz',61),
  ('機體形式','form_factor','multi_select',null,62), ('供電方式','power_method','multi_select',null,63),
  ('無線麥克風數','wireless_mic_count','number','支',64), ('媒體功能','media_feature','multi_select',null,65),
  ('設備類型','device_type','multi_select',null,66), ('排程功能','schedule_support','multi_select',null,67),
  ('SIP 支援','sip_support','multi_select',null,68), ('緊急優先廣播','emergency_priority','multi_select',null,69),
  ('儲存容量','storage_capacity_gb','number','GB',70), ('最高影像模式','max_video_mode','multi_select',null,71),
  ('儲存容量','storage_capacity_tb','number','TB',72), ('歌曲容量','song_capacity','number','首',73),
  ('手機點歌','mobile_song_selection','multi_select',null,74), ('語音搜尋','voice_search','multi_select',null,75),
  ('線上更新歌曲','online_song_update','multi_select',null,76), ('攝影機用途','camera_application','multi_select',null,80),
  ('解析度','resolution','multi_select',null,81), ('最高幀率','max_frame_rate_fps','number','fps',82),
  ('水平視角','horizontal_fov_deg','number','°',83), ('光學變焦','optical_zoom_x','number','倍',84),
  ('數位變焦','digital_zoom_x','number','倍',85), ('影像輸出介面','video_output_interface','multi_select',null,86),
  ('串流協定','streaming_protocol','multi_select',null,87), ('自動追蹤','auto_tracking','multi_select',null,88),
  ('PoE 標準','poe_standard','multi_select',null,89), ('拾音距離','microphone_pickup_range_m','number','m',90),
  ('影像輸入介面','video_input_interface','multi_select',null,91), ('影像輸入數','video_input_count','number','路',92),
  ('影像輸出數','video_output_count','number','路',93), ('最大資料率','max_data_rate_gbps','number','Gbps',94),
  ('HDCP 版本','hdcp_version','multi_select',null,95), ('擷取解析度','capture_resolution','multi_select',null,96),
  ('擷取通道數','capture_channel_count','number','路',97), ('Loop-through','loop_through','multi_select',null,98),
  ('儲存 Bay 數','storage_bay_count','number','Bay',99), ('錄影通道數','recording_channel_count','number','路',100),
  ('RAID','raid_level','multi_select',null,101), ('光源','light_source','multi_select',null,110),
  ('成像技術','display_technology','multi_select',null,111), ('亮度','brightness_ansi_lm','number','ANSI lm',112),
  ('投射型態','throw_type','multi_select',null,113), ('最小投射比','throw_ratio_min','number',':1',114),
  ('最大投射比','throw_ratio_max','number',':1',115), ('顯示器類型','display_subtype','multi_select',null,120),
  ('顯示尺寸','display_size_in','number','吋',121), ('亮度','brightness_nit','number','nit',122),
  ('觸控功能','touch_support','multi_select',null,123), ('觸控點數','touch_points','number','點',124),
  ('運作時數','operation_duty','multi_select',null,125), ('顯示方向','orientation','multi_select',null,126),
  ('像素間距','pixel_pitch_mm','number','mm',127), ('布幕類型','screen_type','multi_select',null,130),
  ('投影方向','projection_direction','multi_select',null,131), ('張力結構','tensioned','multi_select',null,132),
  ('透聲幕','acoustic_transparent','multi_select',null,133), ('抗環境光','ambient_light_rejecting','multi_select',null,134),
  ('畫面比例','aspect_ratio','multi_select',null,135), ('對角尺寸','diagonal_in','number','吋',136),
  ('幕面增益','screen_gain','number',null,137), ('交換器管理層級','management_layer','multi_select',null,140),
  ('總埠數','total_port_count','number','埠',141), ('PoE 埠數','poe_port_count','number','埠',142),
  ('PoE 總功率','poe_budget_w','number','W',143), ('單埠最高速率','max_port_speed_gbps','number','Gbps',144),
  ('交換容量','switching_capacity_gbps','number','Gbps',145), ('CPU 系列','cpu_family','multi_select',null,150),
  ('記憶體','memory_gb','number','GB',151), ('儲存容量','computer_storage_tb','number','TB',152),
  ('網路速率','nic_speed_gbps','number','Gbps',153), ('UPS 拓撲','topology','multi_select',null,160),
  ('容量','capacity_va','number','VA',161), ('輸出波形','output_waveform','multi_select',null,162),
  ('插座類型','outlet_type','multi_select',null,163), ('插座數','outlet_count','number','孔',164),
  ('續航時間','runtime_min','number','分鐘',165), ('續航負載','runtime_load_percent','number','%',166),
  ('最大電流','max_current_a','number','A',170), ('突波吸收','surge_joule','number','J',171),
  ('時序延遲','sequence_delay_s','number','秒',172), ('訊號類型','signal_type','multi_select',null,180),
  ('接頭 A','connector_a','multi_select',null,181), ('接頭 B','connector_b','multi_select',null,182),
  ('接頭 A 公母','connector_a_gender','multi_select',null,183), ('接頭 B 公母','connector_b_gender','multi_select',null,184),
  ('長度','length_m','number','m',185), ('方向性','directionality','multi_select',null,186),
  ('承重','load_capacity_kg','number','kg',190), ('最小適用尺寸','display_size_min_in','number','吋',191),
  ('最大適用尺寸','display_size_max_in','number','吋',192), ('VESA','vesa_pattern','multi_select',null,193),
  ('機櫃高度','rack_unit','number','U',194), ('深度','depth_mm','number','mm',195),
  ('支援協定','automation_protocol','multi_select',null,200), ('串列埠數','serial_port_count','number','埠',201),
  ('Relay 數','relay_count','number','組',202), ('GPIO 數','gpio_count','number','組',203),
  ('面板尺寸','panel_size_in','number','吋',210), ('按鍵數','button_count','number','鍵',211),
  ('感測類型','sensor_type','multi_select',null,220), ('通訊方式','sensor_protocol','multi_select',null,221),
  ('IP 防護等級','ip_rating','multi_select',null,222), ('控制設備類型','actuator_type','multi_select',null,230),
  ('迴路／區域數','circuit_zone_count','number','路',231), ('燈具類型','fixture_type','multi_select',null,240),
  ('色彩系統','color_system','multi_select',null,241), ('燈光控制協定','lighting_protocol','multi_select',null,242),
  ('光源功率','source_power_w','number','W',243), ('光束角','beam_angle_deg','number','°',244),
  ('色溫','cct_k','number','K',245), ('演色性','cri','number','CRI',246),
  ('Universe 數','universe_count','number','組',250), ('DMX 通道數','dmx_channel_count','number','ch',251)
)
insert into public.product_filter_groups(name,slug,input_type,unit,sort_order)
select * from seed
on conflict(slug) do update set name=excluded.name,input_type=excluded.input_type,unit=excluded.unit,sort_order=excluded.sort_order,is_active=true;

with seed(group_slug,name,slug,sort_order) as (values
 ('amplifier_application','卡拉 OK','karaoke',10),('amplifier_application','專業舞台','stage',20),('amplifier_application','商用定壓','commercial_pa',30),('amplifier_application','家庭影音','home_av',40),
 ('power_basis','RMS／Continuous','continuous',10),('power_basis','Program','program',20),('power_basis','Peak／Max','peak',30),
 ('constant_voltage_mode','70V','70v',10),('constant_voltage_mode','100V','100v',20),
 ('input_interface','XLR','xlr',10),('input_interface','RCA','rca',20),('input_interface','6.3mm','jack_6_3',30),('input_interface','HDMI','hdmi',40),('input_interface','USB','usb',50),('input_interface','光纖','optical',60),('input_interface','同軸','coaxial',70),('input_interface','藍牙','bluetooth',80),
 ('output_interface','XLR','xlr',10),('output_interface','RCA','rca',20),('output_interface','speakON','speakon',30),('output_interface','端子台','terminal_block',40),('output_interface','HDMI','hdmi',50),
 ('powered_type','主動式','powered',10),('powered_type','被動式','passive',20),
 ('speaker_type','全音域','full_range',10),('speaker_type','超低音','subwoofer',20),('speaker_type','線陣列','line_array',30),('speaker_type','號角','horn',40),
 ('mounting','桌面／落地','floor_desktop',10),('mounting','壁掛','wall',20),('mounting','吸頂','ceiling',30),('mounting','吊掛','suspended',40),('mounting','機架式','rack',50),
 ('transmission_type','有線','wired',10),('transmission_type','無線','wireless',20),
 ('mic_form','手持','handheld',10),('mic_form','領夾','lavalier',20),('mic_form','頭戴','headset',30),('mic_form','鵝頸','gooseneck',40),('mic_form','界面式','boundary',50),('mic_form','吸頂','ceiling',60),
 ('transducer_type','動圈式','dynamic',10),('transducer_type','電容式','condenser',20),('transducer_type','鋁帶式','ribbon',30),
 ('polar_pattern','心形','cardioid',10),('polar_pattern','超心形','supercardioid',20),('polar_pattern','全指向','omnidirectional',30),('polar_pattern','8 字形','figure_8',40),
 ('mixer_type','數位','digital',10),('mixer_type','類比','analog',20),('mixer_type','直播','streaming',30),
 ('network_audio_protocol','Dante','dante',10),('network_audio_protocol','AES67','aes67',20),('network_audio_protocol','AVB','avb',30),
 ('recording_interface','USB 錄音','usb_recording',10),('recording_interface','SD 卡錄音','sd_recording',20),('recording_interface','多軌錄音','multitrack',30),
 ('control_protocol','Ethernet','ethernet',10),('control_protocol','RS-232','rs232',20),('control_protocol','GPIO','gpio',30),
 ('aec_support','支援 AEC','yes',10),('feedback_suppression','支援回授抑制','yes',10),
 ('host_interface','USB','usb',10),('host_interface','USB-C','usb_c',20),('host_interface','Thunderbolt','thunderbolt',30),('host_interface','PCIe','pcie',40),
 ('bit_depth','16-bit','16_bit',10),('bit_depth','24-bit','24_bit',20),('bit_depth','32-bit float','32_bit_float',30),
 ('form_factor','桌上型','desktop',10),('form_factor','機架式','rack',20),('form_factor','壁掛／嵌入','wall_embedded',30),('form_factor','可攜式','portable',40),
 ('power_method','市電','ac',10),('power_method','充電電池','battery',20),('power_method','市電＋電池','hybrid',30),('power_method','PoE','poe',40),
 ('media_feature','藍牙','bluetooth',10),('media_feature','USB 播放','usb',20),('media_feature','SD 卡','sd',30),('media_feature','內建播放器','player',40),
 ('device_type','音源播放器','media_player',10),('device_type','排程器','scheduler',20),('device_type','分區選擇器','zone_selector',30),('device_type','電話／SIP 廣播','sip_paging',40),
 ('schedule_support','支援排程','yes',10),('sip_support','支援 SIP','yes',10),('emergency_priority','支援優先／緊急廣播','yes',10),
 ('max_video_mode','4K','4k',10),('max_video_mode','1080p','1080p',20),('mobile_song_selection','支援手機點歌','yes',10),('voice_search','支援語音搜尋','yes',10),('online_song_update','支援線上更新','yes',10),
 ('camera_application','視訊會議','conference',10),('camera_application','廣播／直播','broadcast',20),('camera_application','監控','surveillance',30),('camera_application','醫療','medical',40),('camera_application','實物展示','document',50),
 ('resolution','HD 720p','720p',10),('resolution','Full HD 1080p','1080p',20),('resolution','4K UHD','4k_uhd',30),('resolution','DCI 4K','dci_4k',40),('resolution','8K','8k',50),
 ('video_output_interface','HDMI','hdmi',10),('video_output_interface','SDI','sdi',20),('video_output_interface','USB','usb',30),('video_output_interface','NDI/IP','ndi_ip',40),
 ('video_input_interface','HDMI','hdmi',10),('video_input_interface','SDI','sdi',20),('video_input_interface','DisplayPort','displayport',30),('video_input_interface','USB','usb',40),('video_input_interface','IP/NDI','ip_ndi',50),
 ('streaming_protocol','RTSP','rtsp',10),('streaming_protocol','RTMP','rtmp',20),('streaming_protocol','SRT','srt',30),('streaming_protocol','NDI','ndi',40),('streaming_protocol','ONVIF','onvif',50),
 ('auto_tracking','支援自動追蹤','yes',10),('poe_standard','PoE','poe',10),('poe_standard','PoE+','poe_plus',20),('poe_standard','PoE++','poe_plus_plus',30),
 ('hdcp_version','HDCP 1.4','hdcp_1_4',10),('hdcp_version','HDCP 2.2','hdcp_2_2',20),('hdcp_version','HDCP 2.3','hdcp_2_3',30),
 ('capture_resolution','1080p','1080p',10),('capture_resolution','4K UHD','4k_uhd',20),('loop_through','支援 Loop-through','yes',10),
 ('raid_level','RAID 0','raid_0',10),('raid_level','RAID 1','raid_1',20),('raid_level','RAID 5','raid_5',30),('raid_level','RAID 6','raid_6',40),('raid_level','RAID 10','raid_10',50),
 ('light_source','雷射','laser',10),('light_source','LED','led',20),('light_source','燈泡','lamp',30),
 ('display_technology','3LCD','3lcd',10),('display_technology','DLP','dlp',20),('display_technology','LCoS','lcos',30),
 ('throw_type','超短焦','ultra_short',10),('throw_type','短焦','short',20),('throw_type','標準焦','standard',30),('throw_type','長焦','long',40),
 ('display_subtype','商用顯示器','commercial_lcd',10),('display_subtype','觸控顯示器','interactive',20),('display_subtype','數位看板','digital_signage',30),('display_subtype','LED 電視牆','direct_view_led',40),
 ('touch_support','支援觸控','yes',10),('operation_duty','16/7','16_7',10),('operation_duty','24/7','24_7',20),('orientation','橫式','landscape',10),('orientation','直式','portrait',20),
 ('screen_type','電動幕','motorized',10),('screen_type','線拉幕','tensioned_motorized',20),('screen_type','氣壓幕','portable_floor',30),('screen_type','框幕','fixed_frame',40),
 ('projection_direction','前投','front',10),('projection_direction','背投','rear',20),('tensioned','具張力','yes',10),('acoustic_transparent','透聲','yes',10),('ambient_light_rejecting','抗環境光','yes',10),
 ('aspect_ratio','4:3','4_3',10),('aspect_ratio','16:9','16_9',20),('aspect_ratio','16:10','16_10',30),('aspect_ratio','2.35:1','2_35_1',40),
 ('management_layer','非網管','unmanaged',10),('management_layer','L2 網管','layer_2',20),('management_layer','L3 網管','layer_3',30),
 ('cpu_family','Intel Core','intel_core',10),('cpu_family','Intel Xeon','intel_xeon',20),('cpu_family','AMD Ryzen','amd_ryzen',30),('cpu_family','ARM','arm',40),
 ('topology','離線式','standby',10),('topology','在線互動式','line_interactive',20),('topology','在線式','online',30),
 ('output_waveform','純正弦波','pure_sine',10),('output_waveform','模擬正弦波','stepped_sine',20),
 ('outlet_type','NEMA','nema',10),('outlet_type','IEC','iec',20),('outlet_type','端子台','terminal',30),
 ('signal_type','HDMI','hdmi',10),('signal_type','DisplayPort','displayport',20),('signal_type','USB','usb',30),('signal_type','網路','network',40),('signal_type','音訊','audio',50),('signal_type','電源','power',60),
 ('connector_a','HDMI','hdmi',10),('connector_a','USB-A','usb_a',20),('connector_a','USB-C','usb_c',30),('connector_a','RJ45','rj45',40),('connector_a','XLR','xlr',50),('connector_a','RCA','rca',60),
 ('connector_b','HDMI','hdmi',10),('connector_b','USB-A','usb_a',20),('connector_b','USB-C','usb_c',30),('connector_b','RJ45','rj45',40),('connector_b','XLR','xlr',50),('connector_b','RCA','rca',60),
 ('connector_a_gender','公','male',10),('connector_a_gender','母','female',20),('connector_b_gender','公','male',10),('connector_b_gender','母','female',20),
 ('directionality','雙向','bidirectional',10),('directionality','A → B 單向','a_to_b',20),('directionality','B → A 單向','b_to_a',30),
 ('vesa_pattern','VESA 75×75','75x75',10),('vesa_pattern','VESA 100×100','100x100',20),('vesa_pattern','VESA 200×200','200x200',30),('vesa_pattern','VESA 400×400','400x400',40),('vesa_pattern','VESA 600×400','600x400',50),
 ('automation_protocol','RS-232','rs232',10),('automation_protocol','RS-485','rs485',20),('automation_protocol','IR','ir',30),('automation_protocol','KNX','knx',40),('automation_protocol','BACnet','bacnet',50),('automation_protocol','Modbus','modbus',60),('automation_protocol','DALI','dali',70),('automation_protocol','DMX','dmx',80),
 ('sensor_type','溫度','temperature',10),('sensor_type','濕度','humidity',20),('sensor_type','CO₂','co2',30),('sensor_type','TVOC','tvoc',40),('sensor_type','PM2.5','pm2_5',50),('sensor_type','光照','illuminance',60),('sensor_type','噪音','noise',70),('sensor_type','漏水','water_leak',80),('sensor_type','佔用','occupancy',90),
 ('sensor_protocol','乾接點','dry_contact',10),('sensor_protocol','Modbus','modbus',20),('sensor_protocol','BACnet','bacnet',30),('sensor_protocol','Zigbee','zigbee',40),('sensor_protocol','Wi-Fi','wifi',50),('sensor_protocol','LoRa','lora',60),
 ('ip_rating','室內','indoor',10),('ip_rating','IP54','ip54',20),('ip_rating','IP65','ip65',30),('ip_rating','IP66','ip66',40),
 ('actuator_type','燈光','lighting',10),('actuator_type','窗簾／升降','shade_lift',20),('actuator_type','門禁／電鎖','access_lock',30),('actuator_type','IR 控制','ir_control',40),
 ('fixture_type','PAR','par',10),('fixture_type','Fresnel','fresnel',20),('fixture_type','Spot','spot',30),('fixture_type','Wash','wash',40),('fixture_type','Beam','beam',50),('fixture_type','Panel','panel',60),('fixture_type','Moving Head','moving_head',70),
 ('color_system','白光','white',10),('color_system','RGB','rgb',20),('color_system','RGBW','rgbw',30),('color_system','RGBAW+UV','rgbaw_uv',40),
 ('lighting_protocol','DMX','dmx',10),('lighting_protocol','RDM','rdm',20),('lighting_protocol','Art-Net','art_net',30),('lighting_protocol','sACN','sacn',40)
)
insert into public.product_filter_options(group_id,name,slug,sort_order)
select g.id,s.name,s.slug,s.sort_order from seed s join public.product_filter_groups g on g.slug=s.group_slug
on conflict(group_id,slug) do update set name=excluded.name,sort_order=excluded.sort_order,is_active=true;

with seed(template_slug, group_slug, sort_order) as (values
 ('amplifier','amplifier_application',10),('amplifier','power_basis',20),('amplifier','rated_power_w',30),('amplifier','rated_load_ohm',40),('amplifier','constant_voltage_mode',50),('amplifier','amp_output_channel_count',60),('amplifier','zone_count',70),('amplifier','input_interface',80),
 ('loudspeaker','powered_type',10),('loudspeaker','speaker_type',20),('loudspeaker','driver_size_in',30),('loudspeaker','continuous_power_w',40),('loudspeaker','peak_power_w',50),('loudspeaker','nominal_impedance_ohm',60),('loudspeaker','max_spl_db',70),('loudspeaker','mounting',80),
 ('microphone','transmission_type',10),('microphone','mic_form',20),('microphone','transducer_type',30),('microphone','polar_pattern',40),('microphone','wireless_channel_count',50),('microphone','operating_range_m',60),('microphone','battery_runtime_h',70),('microphone','output_interface',80),
 ('mixer','mixer_type',10),('mixer','mixing_input_channel_count',20),('mixer','mic_preamp_count',30),('mixer','analog_output_count',40),('mixer','bus_count',50),('mixer','matrix_count',60),('mixer','network_audio_protocol',70),('mixer','recording_interface',80),
 ('audio_dsp','analog_input_count',10),('audio_dsp','analog_output_count',20),('audio_dsp','dsp_channel_count',30),('audio_dsp','network_audio_protocol',40),('audio_dsp','control_protocol',50),('audio_dsp','aec_support',60),('audio_dsp','feedback_suppression',70),
 ('audio_interface','host_interface',10),('audio_interface','mic_preamp_count',20),('audio_interface','line_input_count',30),('audio_interface','line_output_count',40),('audio_interface','simultaneous_input_count',50),('audio_interface','simultaneous_output_count',60),('audio_interface','bit_depth',70),('audio_interface','sample_rate_khz',80),
 ('portable_pa','form_factor',10),('portable_pa','power_method',20),('portable_pa','continuous_power_w',30),('portable_pa','max_spl_db',40),('portable_pa','driver_size_in',50),('portable_pa','battery_runtime_h',60),('portable_pa','wireless_mic_count',70),('portable_pa','media_feature',80),
 ('media_player_paging','device_type',10),('media_player_paging','zone_count',20),('media_player_paging','input_interface',30),('media_player_paging','output_interface',40),('media_player_paging','schedule_support',50),('media_player_paging','sip_support',60),('media_player_paging','emergency_priority',70),('media_player_paging','storage_capacity_gb',80),
 ('karaoke_player','max_video_mode',10),('karaoke_player','storage_capacity_tb',20),('karaoke_player','song_capacity',30),('karaoke_player','input_interface',40),('karaoke_player','output_interface',50),('karaoke_player','mobile_song_selection',60),('karaoke_player','voice_search',70),('karaoke_player','online_song_update',80),
 ('camera_ptz_ip','camera_application',10),('camera_ptz_ip','resolution',20),('camera_ptz_ip','max_frame_rate_fps',30),('camera_ptz_ip','horizontal_fov_deg',40),('camera_ptz_ip','optical_zoom_x',50),('camera_ptz_ip','video_output_interface',60),('camera_ptz_ip','streaming_protocol',70),('camera_ptz_ip','auto_tracking',80),
 ('video_router','video_input_interface',10),('video_router','video_output_interface',20),('video_router','video_input_count',30),('video_router','video_output_count',40),('video_router','resolution',50),('video_router','max_frame_rate_fps',60),('video_router','max_data_rate_gbps',70),('video_router','hdcp_version',80),
 ('video_capture_stream','video_input_interface',10),('video_capture_stream','host_interface',20),('video_capture_stream','capture_resolution',30),('video_capture_stream','max_frame_rate_fps',40),('video_capture_stream','capture_channel_count',50),('video_capture_stream','loop_through',60),
 ('media_storage_nvr','recording_channel_count',10),('media_storage_nvr','storage_bay_count',20),('media_storage_nvr','storage_capacity_tb',30),('media_storage_nvr','raid_level',40),('media_storage_nvr','resolution',50),('media_storage_nvr','max_frame_rate_fps',60),('media_storage_nvr','output_interface',70),
 ('projector','light_source',10),('projector','display_technology',20),('projector','resolution',30),('projector','brightness_ansi_lm',40),('projector','throw_type',50),('projector','throw_ratio_min',60),('projector','throw_ratio_max',70),('projector','input_interface',80),
 ('commercial_display','display_subtype',10),('commercial_display','display_size_in',20),('commercial_display','resolution',30),('commercial_display','brightness_nit',40),('commercial_display','touch_support',50),('commercial_display','touch_points',60),('commercial_display','operation_duty',70),('commercial_display','orientation',80),
 ('projection_screen','screen_type',10),('projection_screen','projection_direction',20),('projection_screen','tensioned',30),('projection_screen','acoustic_transparent',40),('projection_screen','ambient_light_rejecting',50),('projection_screen','aspect_ratio',60),('projection_screen','diagonal_in',70),('projection_screen','screen_gain',80),
 ('network_switch','management_layer',10),('network_switch','total_port_count',20),('network_switch','poe_standard',30),('network_switch','poe_port_count',40),('network_switch','poe_budget_w',50),('network_switch','max_port_speed_gbps',60),('network_switch','switching_capacity_gbps',70),('network_switch','form_factor',80),
 ('computer_storage','cpu_family',10),('computer_storage','memory_gb',20),('computer_storage','computer_storage_tb',30),('computer_storage','storage_bay_count',40),('computer_storage','raid_level',50),('computer_storage','nic_speed_gbps',60),('computer_storage','form_factor',70),
 ('ups_pdu','topology',10),('ups_pdu','capacity_va',20),('ups_pdu','rated_power_w',30),('ups_pdu','output_waveform',40),('ups_pdu','outlet_type',50),('ups_pdu','outlet_count',60),('ups_pdu','runtime_min',70),('ups_pdu','runtime_load_percent',80),
 ('rack_power','outlet_type',10),('rack_power','outlet_count',20),('rack_power','max_current_a',30),('rack_power','rated_power_w',40),('rack_power','surge_joule',50),('rack_power','sequence_delay_s',60),('rack_power','form_factor',70),
 ('cable_adapter_extender','signal_type',10),('cable_adapter_extender','connector_a',20),('cable_adapter_extender','connector_b',30),('cable_adapter_extender','connector_a_gender',40),('cable_adapter_extender','connector_b_gender',50),('cable_adapter_extender','length_m',60),('cable_adapter_extender','directionality',70),('cable_adapter_extender','max_data_rate_gbps',80),
 ('display_mount','mounting',10),('display_mount','display_size_min_in',20),('display_mount','display_size_max_in',30),('display_mount','load_capacity_kg',40),('display_mount','vesa_pattern',50),
 ('rack_mount_accessory','form_factor',10),('rack_mount_accessory','rack_unit',20),('rack_mount_accessory','depth_mm',30),('rack_mount_accessory','load_capacity_kg',40),('rack_mount_accessory','mounting',50),
 ('control_processor_gateway','automation_protocol',10),('control_processor_gateway','serial_port_count',20),('control_processor_gateway','relay_count',30),('control_processor_gateway','gpio_count',40),('control_processor_gateway','poe_standard',50),('control_processor_gateway','form_factor',60),
 ('control_panel','panel_size_in',10),('control_panel','resolution',20),('control_panel','button_count',30),('control_panel','poe_standard',40),('control_panel','mounting',50),('control_panel','automation_protocol',60),
 ('environment_sensor','sensor_type',10),('environment_sensor','sensor_protocol',20),('environment_sensor','power_method',30),('environment_sensor','ip_rating',40),('environment_sensor','mounting',50),
 ('building_actuator','actuator_type',10),('building_actuator','automation_protocol',20),('building_actuator','circuit_zone_count',30),('building_actuator','rated_power_w',40),('building_actuator','max_current_a',50),('building_actuator','form_factor',60),
 ('lighting_fixture','fixture_type',10),('lighting_fixture','color_system',20),('lighting_fixture','lighting_protocol',30),('lighting_fixture','ip_rating',40),('lighting_fixture','source_power_w',50),('lighting_fixture','beam_angle_deg',60),('lighting_fixture','cct_k',70),('lighting_fixture','cri',80),
 ('lighting_control','lighting_protocol',10),('lighting_control','universe_count',20),('lighting_control','dmx_channel_count',30),('lighting_control','analog_output_count',40),('lighting_control','form_factor',50)
)
insert into public.product_filter_template_groups(template_id,group_id,sort_order)
select t.id,g.id,s.sort_order from seed s join public.product_filter_templates t on t.slug=s.template_slug join public.product_filter_groups g on g.slug=s.group_slug
on conflict(template_id,group_id) do update set sort_order=excluded.sort_order;

-- 依既有小類名稱映射模板；允許同一小類套用多個互補模板。
with rules(pattern,template_slug) as (values
 ('(數位|類比|直播)?混音器','mixer'), ('數位訊號處理器|訊號處理器|網路音訊','audio_dsp'), ('錄音介面|音訊介面','audio_interface'),
 ('擴大機','amplifier'), ('喇叭','loudspeaker'), ('麥克風$|麥克風系統|吸頂式麥克風|會議喇叭麥克風','microphone'),
 ('行動音箱|手提式擴音器|手拉式擴音機|肩背式擴音器|大聲公|喊話器|攜帶式擴音','portable_pa'),
 ('音源撥放器|音源播放器|媒體播放器|排程器|分區選擇器|電話廣播|IP電話總機','media_player_paging'), ('點歌機','karaoke_player'),
 ('PTZ|攝影機|實物投影機|實物攝影機|展台','camera_ptz_ip'), ('矩陣|KVM|AV-over-IP|OIP|影像處理器|視訊會議系統','video_router'),
 ('擷取|串流導播|專業導播機|直播機|串流媒體/直播機','video_capture_stream'), ('NVR|串流媒體儲存設備|硬碟','media_storage_nvr'),
 ('投影機$','projector'), ('商業顯示器|觸控顯示器|顯示器$|廣告機|數位看板|LED無縫電視牆','commercial_display'),
 ('布幕|框幕','projection_screen'), ('交換器|^AP$|PoE交換器','network_switch'), ('播放主機|電腦|伺服器|NAS','computer_storage'),
 ('UPS|PDU','ups_pdu'), ('電源供應濾波器|時序控制器|時序分配器|電源延長線','rack_power'),
 ('線材|轉接|延伸器|延長切換|傳輸/延長器','cable_adapter_extender'), ('顯示器架','display_mount'),
 ('支架|防護配件|機櫃|吊掛五金|麥克風周邊配件|週邊配件|影音配件','rack_mount_accessory'),
 ('環控主機|擴充盒|協定閘道器|環控系統','control_processor_gateway'), ('觸控面板|排程面板|按鍵面板|無線觸控器|App','control_panel'),
 ('感測|噪音計|電錶|電流鉗|門磁|震動','environment_sensor'), ('燈光控制|電動窗簾|升降|門禁|電鎖|IR發射|IR學習','building_actuator'),
 ('舞台燈|影視燈|建築燈','lighting_fixture'), ('燈光控台|DMX分配','lighting_control'), ('充電車|充電櫃','ups_pdu')
)
insert into public.product_category_filter_templates(category_id,template_id)
select distinct c.id,t.id from public.product_categories c join rules r on c.sub_category ~ r.pattern join public.product_filter_templates t on t.slug=r.template_slug
on conflict do nothing;

-- 舊的全域通用群組保留資料但不再顯示，避免已存在的產品標籤遺失。
