insert into public.role_permissions (role_key, feature_key, can_view, can_create, can_edit, can_delete, can_cost)
select key, 'product-selector', true, key <> 'viewer', key <> 'viewer', false, false
from public.app_roles
where key in ('admin', 'manager', 'sales', 'viewer')
on conflict (role_key, feature_key) do nothing;
