export const WORDPRESS_FILTER_SET_SNIPPET_NAME = '光輝 CRM 分類篩選器同步'

/**
 * WordPress/Code Snippets 端的同步橋接器。
 *
 * 僅管理帶有 gh_crm_* meta 的 Filter Set / Filter；遇到既有同分類 Filter Set
 * 時會先備份原始 post_content 再接管，相同分類以外的人工設定不會被刪除。
 */
export const wordpressFilterSetSnippet = String.raw`
add_action( 'rest_api_init', function() {
    register_rest_route( 'gh-crm/v1', '/filter-sets/sync', array(
        'methods'  => 'POST',
        'callback' => 'gh_crm_sync_filter_sets',
        'permission_callback' => function() {
            return current_user_can( 'manage_woocommerce' ) || current_user_can( 'manage_options' );
        },
    ) );
} );

function gh_crm_filter_defaults() {
    return array(
        'entity' => 'taxonomy', 'e_name' => '', 'view' => 'checkboxes',
        'date_type' => 'date', 'show_term_names' => 'yes', 'dropdown_label' => '',
        'date_format' => 'F j, Y', 'logic' => 'or', 'orderby' => 'default',
        'in_path' => 'yes', 'range_slider' => 'yes', 'step' => '1',
        'parent_filter' => '-1', 'min_num_label' => '', 'max_num_label' => '',
        'tooltip' => '', 'show_chips' => 'yes', 'more_less' => 'yes',
    );
}

function gh_crm_find_filter_set( $crm_category_id, $location ) {
    $managed = get_posts( array(
        'post_type' => FLRT_FILTERS_SET_POST_TYPE, 'post_status' => array( 'publish', 'draft', 'inherit' ),
        'posts_per_page' => 1, 'meta_key' => 'gh_crm_category_id', 'meta_value' => $crm_category_id,
        'orderby' => 'ID', 'order' => 'ASC',
    ) );
    if ( ! empty( $managed ) ) return $managed[0];

    $same_location = get_posts( array(
        'post_type' => FLRT_FILTERS_SET_POST_TYPE, 'post_status' => array( 'publish', 'draft', 'inherit' ),
        'posts_per_page' => 1, 'name' => $location, 'orderby' => 'ID', 'order' => 'ASC',
    ) );
    return empty( $same_location ) ? null : $same_location[0];
}

function gh_crm_filter_set_template() {
    $sets = get_posts( array(
        'post_type' => FLRT_FILTERS_SET_POST_TYPE, 'post_status' => 'publish',
        'posts_per_page' => 20, 'meta_key' => 'wpc_filter_set_post_type', 'meta_value' => 'product',
        'orderby' => 'ID', 'order' => 'ASC',
    ) );
    foreach ( $sets as $set ) {
        if ( is_array( maybe_unserialize( $set->post_content ) ) ) return $set;
    }
    return null;
}

function gh_crm_upsert_filter_set( $category, &$warnings ) {
    $term_id = absint( $category['woo_category_id'] ?? 0 );
    $term = $term_id ? get_term( $term_id, 'product_cat' ) : null;
    if ( ! $term || is_wp_error( $term ) ) {
        return new WP_Error( 'gh_category_missing', '找不到 WooCommerce 商品分類', array( 'status' => 422 ) );
    }

    $crm_category_id = sanitize_text_field( $category['crm_category_id'] ?? '' );
    $location = 'product_cat___' . $term_id;
    $set = gh_crm_find_filter_set( $crm_category_id, $location );
    $template = $set ?: gh_crm_filter_set_template();
    $set_fields = $template ? maybe_unserialize( $template->post_content ) : array();
    if ( ! is_array( $set_fields ) ) $set_fields = array();
    $set_fields = array_merge( array(
        'hide_empty' => 'yes', 'show_count' => 'yes',
        'wp_page_type' => 'taxonomy___product_cat', 'wp_filter_query' => '-1',
    ), $set_fields );
    $set_fields['hide_empty'] = 'yes';
    $set_fields['show_count'] = 'yes';
    $set_fields['wp_page_type'] = 'taxonomy___product_cat';

    $title = 'CRM－' . sanitize_text_field( $category['title'] ?? $term->name );
    $post_data = wp_slash( array(
        'ID' => $set ? $set->ID : 0,
        'post_type' => FLRT_FILTERS_SET_POST_TYPE,
        'post_status' => 'publish',
        'post_title' => $title,
        'post_excerpt' => 'product',
        'post_name' => $location,
        'post_content' => maybe_serialize( $set_fields ),
    ) );

    if ( $set && ! get_post_meta( $set->ID, 'gh_crm_category_id', true ) ) {
        update_post_meta( $set->ID, 'gh_crm_original_post_content', base64_encode( (string) $set->post_content ) );
        update_post_meta( $set->ID, 'gh_crm_adopted_at', gmdate( 'c' ) );
    }
    if ( function_exists( 'flrt_force_non_unique_slug' ) ) add_filter( 'pre_wp_unique_post_slug', 'flrt_force_non_unique_slug', 10, 2 );
    $set_id = $set ? wp_update_post( $post_data, true ) : wp_insert_post( $post_data, true );
    if ( function_exists( 'flrt_force_non_unique_slug' ) ) remove_filter( 'pre_wp_unique_post_slug', 'flrt_force_non_unique_slug', 10 );
    if ( is_wp_error( $set_id ) ) return $set_id;

    update_post_meta( $set_id, 'gh_crm_category_id', $crm_category_id );
    update_post_meta( $set_id, 'gh_crm_woo_category_id', $term_id );
    update_post_meta( $set_id, 'wpc_filter_set_post_type', 'product' );
    if ( $template && $template->ID !== $set_id ) {
        update_post_meta( $set_id, 'wpc_filter_set_query_vars', get_post_meta( $template->ID, 'wpc_filter_set_query_vars', true ) );
    }
    if ( '-1' === (string) ( $set_fields['wp_filter_query'] ?? '-1' ) ) {
        $warnings[] = '分類「' . $term->name . '」沿用不到既有 Main Query；請在 Filter Set 內選一次 Product Main Query。';
    }
    return absint( $set_id );
}

function gh_crm_find_managed_filter( $set_id, $group_id, $entity, $e_name ) {
    $managed = get_posts( array(
        'post_type' => FLRT_FILTERS_POST_TYPE, 'post_status' => array( 'publish', 'draft', 'inherit', 'trash' ),
        'post_parent' => $set_id, 'posts_per_page' => 1,
        'meta_key' => 'gh_crm_group_id', 'meta_value' => $group_id,
    ) );
    if ( ! empty( $managed ) ) return $managed[0];

    $children = get_posts( array(
        'post_type' => FLRT_FILTERS_POST_TYPE, 'post_status' => array( 'publish', 'draft', 'inherit' ),
        'post_parent' => $set_id, 'posts_per_page' => -1, 'orderby' => 'menu_order', 'order' => 'ASC',
    ) );
    foreach ( $children as $child ) {
        $content = maybe_unserialize( $child->post_content );
        if ( is_array( $content ) && ( $content['entity'] ?? '' ) === $entity && ( $content['e_name'] ?? '' ) === $e_name ) {
            return $child;
        }
    }
    return null;
}

function gh_crm_upsert_filter( $set_id, $filter, $menu_order, &$permalinks ) {
    $group_id = sanitize_text_field( $filter['crm_group_id'] ?? '' );
    $input_type = ( $filter['input_type'] ?? '' ) === 'number' ? 'number' : 'multi_select';
    $attribute_slug = sanitize_key( $filter['woo_attribute_slug'] ?? '' );
    $group_slug = sanitize_title( str_replace( '_', '-', (string) ( $filter['slug'] ?? '' ) ) );
    $entity = $input_type === 'number' ? 'post_meta_num' : 'taxonomy';
    $e_name = $input_type === 'number' ? 'gh_filter_' . sanitize_key( $filter['slug'] ?? '' ) : $attribute_slug;
    if ( ! $group_id || ! $group_slug || ! $e_name ) return new WP_Error( 'gh_filter_invalid', '篩選器資料不完整' );

    $link_key = $entity . '#' . $e_name;
    $url_slug = ! empty( $permalinks[$link_key] ) ? sanitize_title( $permalinks[$link_key] ) : $group_slug;
    $permalinks[$link_key] = $url_slug;
    $post_excerpt = $entity;
    $existing = gh_crm_find_managed_filter( $set_id, $group_id, $entity, $e_name );
    $content = $existing ? maybe_unserialize( $existing->post_content ) : array();
    if ( ! is_array( $content ) ) $content = array();
    $content = array_merge( gh_crm_filter_defaults(), $content, array(
        'entity' => $entity,
        'e_name' => $e_name,
        'view' => $input_type === 'number' ? 'range' : ( ( $filter['selection_mode'] ?? '' ) === 'single' ? 'radio' : 'checkboxes' ),
        'logic' => $input_type === 'number' ? 'and' : 'or',
        'in_path' => $input_type === 'number' ? 'no' : 'yes',
    ) );
    if ( $input_type === 'number' ) unset( $content['in_path'] );

    if ( $existing && ! get_post_meta( $existing->ID, 'gh_crm_group_id', true ) ) {
        update_post_meta( $existing->ID, 'gh_crm_original_post_content', base64_encode( (string) $existing->post_content ) );
    }
    $post_data = wp_slash( array(
        'ID' => $existing ? $existing->ID : 0,
        'post_type' => FLRT_FILTERS_POST_TYPE,
        'post_status' => 'publish',
        'post_parent' => $set_id,
        'post_title' => sanitize_text_field( $filter['name'] ?? '' ),
        'post_name' => $url_slug,
        'post_excerpt' => $post_excerpt,
        'post_content' => maybe_serialize( $content ),
        'menu_order' => absint( $menu_order ),
    ) );
    if ( function_exists( 'flrt_force_non_unique_slug' ) ) add_filter( 'pre_wp_unique_post_slug', 'flrt_force_non_unique_slug', 10, 2 );
    $filter_id = $existing ? wp_update_post( $post_data, true ) : wp_insert_post( $post_data, true );
    if ( function_exists( 'flrt_force_non_unique_slug' ) ) remove_filter( 'pre_wp_unique_post_slug', 'flrt_force_non_unique_slug', 10 );
    if ( is_wp_error( $filter_id ) ) return $filter_id;
    update_post_meta( $filter_id, 'gh_crm_group_id', $group_id );
    update_post_meta( $filter_id, 'gh_crm_managed', '1' );
    return absint( $filter_id );
}

function gh_crm_sync_filter_sets( WP_REST_Request $request ) {
    if ( ! defined( 'FLRT_FILTERS_SET_POST_TYPE' ) || ! defined( 'FLRT_FILTERS_POST_TYPE' ) ) {
        return new WP_Error( 'gh_filter_plugin_missing', 'Filter Everything 尚未啟用', array( 'status' => 409 ) );
    }
    $categories = $request->get_param( 'categories' );
    if ( ! is_array( $categories ) || count( $categories ) > 100 ) {
        return new WP_Error( 'gh_payload_invalid', '分類同步資料格式錯誤', array( 'status' => 400 ) );
    }

    $result = array( 'sets' => 0, 'filters' => 0, 'trashed' => 0, 'warnings' => array() );
    $permalinks = get_option( 'wpc_filter_permalinks', array() );
    if ( ! is_array( $permalinks ) ) $permalinks = array();

    foreach ( $categories as $category ) {
        if ( ! is_array( $category ) ) continue;
        $set_id = gh_crm_upsert_filter_set( $category, $result['warnings'] );
        if ( is_wp_error( $set_id ) ) return $set_id;
        $result['sets']++;
        $keep = array();
        foreach ( (array) ( $category['filters'] ?? array() ) as $index => $filter ) {
            if ( ! is_array( $filter ) ) continue;
            $filter_id = gh_crm_upsert_filter( $set_id, $filter, ( $index + 1 ) * 10, $permalinks );
            if ( is_wp_error( $filter_id ) ) return $filter_id;
            $keep[] = $filter_id;
            $result['filters']++;
        }

        $managed = get_posts( array(
            'post_type' => FLRT_FILTERS_POST_TYPE, 'post_status' => array( 'publish', 'draft', 'inherit' ),
            'post_parent' => $set_id, 'posts_per_page' => -1,
            'meta_key' => 'gh_crm_managed', 'meta_value' => '1', 'fields' => 'ids',
        ) );
        foreach ( $managed as $filter_id ) {
            if ( ! in_array( absint( $filter_id ), $keep, true ) ) {
                wp_trash_post( $filter_id );
                $result['trashed']++;
            }
        }
        clean_post_cache( $set_id );
    }
    update_option( 'wpc_filter_permalinks', $permalinks );
    $result['plugin_version'] = defined( 'FLRT_PLUGIN_VER' ) ? FLRT_PLUGIN_VER : 'unknown';
    return rest_ensure_response( $result );
}
`
