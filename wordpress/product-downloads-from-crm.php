<?php
/**
 * Code Snippets: 商品資料下載（CRM）
 *
 * CRM 將下載檔清單寫入 av_download_files。官網既有的
 * 「產品資料下載」自訂頁籤透過 [avshop_downloads] 顯示內容。
 */

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
 * 不註冊 woocommerce_product_tabs。avshop 主題會把 Woo 分頁與自訂分頁
 * 合併；額外建立原生 Woo 分頁會讓「產品資料下載」出現兩次。
 */

add_action( 'wp_head', function() {
    if ( ! function_exists( 'is_product' ) || ! is_product() ) return;
    echo '<style>.gh-product-downloads{display:grid;gap:10px}.gh-product-download{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none!important;color:#1f2937!important;background:#fff}.gh-product-download:hover{border-color:#2563eb;background:#eff6ff;color:#1d4ed8!important}.gh-product-download__action{color:#2563eb;font-weight:600;white-space:nowrap}</style>';
} );
