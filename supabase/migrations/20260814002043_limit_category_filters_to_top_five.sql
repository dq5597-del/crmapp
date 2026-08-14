-- Keep only the five highest-value buying filters per reusable template.
-- Existing product option/number assignments are intentionally preserved.
with desired(template_slug, group_slugs) as (values
  ('mixer', array['mixer_type','mixing_input_channel_count','mic_preamp_count','analog_output_count','network_audio_protocol']),
  ('audio_dsp', array['analog_input_count','analog_output_count','dsp_channel_count','network_audio_protocol','aec_support']),
  ('audio_interface', array['host_interface','mic_preamp_count','simultaneous_input_count','simultaneous_output_count','sample_rate_khz']),
  ('amplifier', array['amp_output_channel_count','rated_power_w','rated_load_ohm','constant_voltage_mode','input_interface']),
  ('loudspeaker', array['powered_type','speaker_type','driver_size_in','continuous_power_w','max_spl_db']),
  ('microphone', array['transmission_type','mic_form','transducer_type','polar_pattern','output_interface']),
  ('portable_pa', array['form_factor','continuous_power_w','battery_runtime_h','wireless_mic_count','media_feature']),
  ('media_player_paging', array['device_type','zone_count','schedule_support','sip_support','output_interface']),
  ('karaoke_player', array['max_video_mode','storage_capacity_tb','song_capacity','mobile_song_selection','online_song_update']),
  ('camera_ptz_ip', array['resolution','optical_zoom_x','video_output_interface','auto_tracking','streaming_protocol']),
  ('video_router', array['video_input_interface','video_output_interface','video_input_count','video_output_count','resolution']),
  ('video_capture_stream', array['video_input_interface','host_interface','capture_resolution','capture_channel_count','loop_through']),
  ('media_storage_nvr', array['recording_channel_count','storage_capacity_tb','storage_bay_count','resolution','raid_level']),
  ('projector', array['resolution','brightness_ansi_lm','light_source','throw_type','input_interface']),
  ('commercial_display', array['display_size_in','resolution','brightness_nit','touch_support','input_interface']),
  ('projection_screen', array['diagonal_in','aspect_ratio','screen_gain','ambient_light_rejecting','acoustic_transparent']),
  ('network_switch', array['total_port_count','management_layer','poe_standard','poe_budget_w','max_port_speed_gbps']),
  ('computer_storage', array['cpu_family','memory_gb','computer_storage_tb','storage_bay_count','form_factor']),
  ('ups_pdu', array['capacity_va','rated_power_w','topology','runtime_min','outlet_type']),
  ('rack_power', array['outlet_type','outlet_count','max_current_a','surge_joule','sequence_delay_s']),
  ('cable_adapter_extender', array['connector_a','connector_b','length_m','directionality','max_data_rate_gbps']),
  ('display_mount', array['mounting','display_size_min_in','display_size_max_in','load_capacity_kg','vesa_pattern']),
  ('rack_mount_accessory', array['form_factor','rack_unit','depth_mm','load_capacity_kg','mounting']),
  ('control_processor_gateway', array['automation_protocol','serial_port_count','relay_count','gpio_count','poe_standard']),
  ('control_panel', array['panel_size_in','button_count','poe_standard','mounting','automation_protocol']),
  ('environment_sensor', array['sensor_type','sensor_protocol','power_method','ip_rating','mounting']),
  ('building_actuator', array['actuator_type','automation_protocol','circuit_zone_count','max_current_a','form_factor']),
  ('lighting_fixture', array['fixture_type','color_system','lighting_protocol','beam_angle_deg','ip_rating']),
  ('lighting_control', array['lighting_protocol','universe_count','dmx_channel_count','analog_output_count','form_factor'])
), cleared as (
  delete from public.product_filter_template_groups tg
  using public.product_filter_templates t, desired d
  where tg.template_id = t.id and t.slug = d.template_slug
  returning tg.template_id
)
insert into public.product_filter_template_groups(template_id, group_id, sort_order)
select t.id, g.id, picked.ordinality * 10
from desired d
join public.product_filter_templates t on t.slug = d.template_slug
cross join lateral unnest(d.group_slugs) with ordinality as picked(group_slug, ordinality)
join public.product_filter_groups g on g.slug = picked.group_slug
on conflict(template_id, group_id) do update set sort_order = excluded.sort_order;

-- Resolve known category-name overlaps so one category cannot union two unrelated templates.
delete from public.product_category_filter_templates mapping
using public.product_filter_templates template
where mapping.template_id = template.id
  and (
    (mapping.category_id = 'bb8a50fe-371f-4f75-915e-1f545b132444' and template.slug = 'projector')
    or (mapping.category_id = '3936863b-b51d-4802-993f-712bf12c288b' and template.slug = 'loudspeaker')
    or (mapping.category_id = '770bdfb2-cdb0-44ea-9943-820d1f00a6f4' and template.slug = 'loudspeaker')
  );
