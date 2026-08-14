export const WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME = '光輝 CRM 商品資料下載'

export const wordpressProductDownloadsSnippet = String.raw`
add_action( 'init', 'gh_crm_register_product_download_files_meta' );
function gh_crm_register_product_download_files_meta() {
    register_post_meta( 'product', 'av_download_files', array(
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        'auth_callback' => function() { return current_user_can( 'edit_products' ); },
    ) );
}

function gh_crm_product_download_items( $product_id ) {
    $files = json_decode( (string) get_post_meta( $product_id, 'av_download_files', true ), true );
    if ( ! is_array( $files ) ) $files = array();
    if ( empty( $files ) ) {
        $legacy = array(
            '產品型錄' => get_post_meta( $product_id, 'av_download_catalog', true ),
            '使用說明書' => get_post_meta( $product_id, 'av_download_manual', true ),
            '規格／CAD' => get_post_meta( $product_id, 'av_download_cad', true ),
        );
        foreach ( $legacy as $name => $url ) {
            if ( $url ) $files[] = array( 'name' => $name, 'url' => $url );
        }
    }
    $items = array();
    foreach ( $files as $file ) {
        $name = isset( $file['name'] ) ? sanitize_text_field( $file['name'] ) : '';
        $url = isset( $file['url'] ) ? esc_url_raw( $file['url'] ) : '';
        if ( $name && $url ) $items[] = array( 'name' => $name, 'url' => $url );
    }
    return $items;
}

function gh_crm_product_downloads_html( $product_id ) {
    $items = gh_crm_product_download_items( $product_id );
    if ( empty( $items ) ) return '<p class="av-empty-tip">此商品尚無可下載檔案</p>';
    $html = '<div class="gh-product-downloads">';
    foreach ( $items as $item ) {
        $html .= '<a class="gh-product-download" href="' . esc_url( $item['url'] ) . '" target="_blank" rel="noopener noreferrer">'
              . '<span>' . esc_html( $item['name'] ) . '</span><span class="gh-product-download__action">下載 PDF</span></a>';
    }
    return $html . '</div>';
}

add_shortcode( 'avshop_downloads', function() {
    return gh_crm_product_downloads_html( get_queried_object_id() ?: get_the_ID() );
} );

/*
 * 官網的 avshop 自訂分頁已在「產品資料下載」內容中嵌入
 * [avshop_downloads]。不可再註冊 woocommerce_product_tabs，否則主題的
 * 分頁合併器會同時收進原生 Woo 分頁與 avshop 分頁，造成標題及內容重複。
 */

add_action( 'wp_head', function() {
    if ( ! function_exists( 'is_product' ) || ! is_product() ) return;
    echo '<style>.gh-product-downloads{display:grid;gap:10px}.gh-product-download{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none!important;color:#1f2937!important;background:#fff}.gh-product-download:hover{border-color:#2563eb;background:#eff6ff;color:#1d4ed8!important}.gh-product-download__action{color:#2563eb;font-weight:600;white-space:nowrap}</style>';
} );
`

export const WORDPRESS_PRODUCT_DOWNLOADS_DEDUP_SNIPPET_NAME = '光輝 CRM 產品下載分頁去重'
