<?php
/**
 * WPCode: 商品資料下載（CRM Google Drive）
 *
 * CRM 會把下載檔清單以 JSON 寫入 av_download_files。
 * 單一商品頁的 Smart Product Tabs Pro 使用 [avshop_downloads] 顯示內容。
 */

add_action( 'init', 'gh_register_product_download_files_meta' );
function gh_register_product_download_files_meta() {
    register_post_meta( 'product', 'av_download_files', array(
        'type'          => 'string',
        'single'        => true,
        'show_in_rest'  => true,
        'auth_callback' => function() {
            return current_user_can( 'edit_products' );
        },
    ) );
}

// 等其他片段載入完成後再註冊，確保商品頁使用這個新版下載清單。
add_action( 'wp_loaded', 'gh_register_product_downloads_shortcode', 99 );
function gh_register_product_downloads_shortcode() {
    add_shortcode( 'avshop_downloads', 'gh_product_downloads_shortcode' );
}

function gh_product_downloads_shortcode() {
    $product_id = get_the_ID();
    if ( function_exists( 'is_product' ) && is_product() ) {
        global $wp_query;
        $product_id = $wp_query->queried_object_id ? $wp_query->queried_object_id : $product_id;
    }

    $files = json_decode( (string) get_post_meta( $product_id, 'av_download_files', true ), true );
    if ( ! is_array( $files ) ) {
        $files = array();
    }

    // 舊商品相容：尚未由新版 CRM 同步時，仍讀取原本三個欄位。
    if ( empty( $files ) ) {
        $legacy = array(
            '產品型錄'   => get_post_meta( $product_id, 'av_download_catalog', true ),
            '使用說明書' => get_post_meta( $product_id, 'av_download_manual', true ),
            '規格／CAD'  => get_post_meta( $product_id, 'av_download_cad', true ),
        );
        foreach ( $legacy as $name => $url ) {
            if ( $url ) {
                $files[] = array( 'name' => $name, 'url' => $url );
            }
        }
    }

    $items = array();
    foreach ( $files as $file ) {
        $name = isset( $file['name'] ) ? sanitize_text_field( $file['name'] ) : '';
        $url  = isset( $file['url'] ) ? esc_url( $file['url'] ) : '';
        if ( $name && $url ) {
            $items[] = array( 'name' => $name, 'url' => $url );
        }
    }

    if ( empty( $items ) ) {
        return '<p class="av-empty-tip">此商品尚無可下載檔案</p>';
    }

    $html = '<style>
        .gh-product-downloads{display:grid;gap:10px}
        .gh-product-download{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none!important;color:#1f2937!important;background:#fff}
        .gh-product-download:hover{border-color:#2563eb;background:#eff6ff;color:#1d4ed8!important}
        .gh-product-download__action{color:#2563eb;font-weight:600;white-space:nowrap}
    </style><div class="gh-product-downloads">';
    foreach ( $items as $item ) {
        $html .= '<a class="gh-product-download" href="' . esc_url( $item['url'] ) . '" target="_blank" rel="noopener noreferrer">'
              . '<span>' . esc_html( $item['name'] ) . '</span>'
              . '<span class="gh-product-download__action">下載</span></a>';
    }
    $html .= '</div>';

    return $html;
}
