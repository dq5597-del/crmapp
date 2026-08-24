export const WORDPRESS_PRODUCT_OPTIONS_SNIPPET_NAME = '光輝 CRM 商品購買選項'

export const wordpressProductOptionsSnippet = String.raw`
function gh_crm_purchase_option_groups( $product_id ) {
    $raw = get_post_meta( $product_id, 'gh_purchase_options', true );
    $groups = json_decode( (string) $raw, true );
    if ( ! is_array( $groups ) ) return array();
    $clean = array();
    foreach ( $groups as $group ) {
        $name = sanitize_text_field( $group['name'] ?? '' );
        $options = array();
        foreach ( (array) ( $group['options'] ?? array() ) as $option ) {
            $label = sanitize_text_field( $option['label'] ?? '' );
            if ( ! $label ) continue;
            $options[] = array(
                'label' => $label,
                'price_adjustment' => max( 0, (float) ( $option['price_adjustment'] ?? 0 ) ),
                'default' => ! empty( $option['default'] ),
            );
        }
        if ( $name && count( $options ) >= 2 ) {
            $clean[] = array(
                'name' => $name,
                'description' => sanitize_text_field( $group['description'] ?? '' ),
                'selection_mode' => ( $group['selection_mode'] ?? 'single' ) === 'multiple' ? 'multiple' : 'single',
                'required' => ! empty( $group['required'] ),
                'options' => $options,
            );
        }
    }
    return $clean;
}

add_action( 'woocommerce_before_add_to_cart_button', function() {
    global $product;
    if ( ! $product ) return;
    $groups = gh_crm_purchase_option_groups( $product->get_id() );
    if ( empty( $groups ) ) return;
    wp_nonce_field( 'gh_purchase_options', 'gh_purchase_options_nonce' );
    echo '<div class="gh-purchase-options"><h3>選擇配件／規格</h3>';
    foreach ( $groups as $group_index => $group ) {
        $required = $group['required'] ? ' <span class="required">*</span>' : '';
        echo '<fieldset class="gh-purchase-option"><legend>' . esc_html( $group['name'] ) . $required . '</legend>';
        if ( $group['description'] ) echo '<p class="gh-purchase-option__description">' . esc_html( $group['description'] ) . '</p>';
        if ( $group['selection_mode'] === 'single' ) {
            echo '<select name="gh_purchase_option[' . esc_attr( $group_index ) . '][]"' . ( $group['required'] ? ' required' : '' ) . '>';
            echo '<option value="">請選擇</option>';
            foreach ( $group['options'] as $option_index => $option ) {
                $price = $option['price_adjustment'] > 0 ? '（+' . wp_strip_all_tags( wc_price( $option['price_adjustment'] ) ) . '）' : '';
                echo '<option value="' . esc_attr( $option_index ) . '"' . selected( $option['default'], true, false ) . '>' . esc_html( $option['label'] . $price ) . '</option>';
            }
            echo '</select>';
        } else {
            echo '<div class="gh-purchase-option__checks">';
            foreach ( $group['options'] as $option_index => $option ) {
                $price = $option['price_adjustment'] > 0 ? '（+' . wp_strip_all_tags( wc_price( $option['price_adjustment'] ) ) . '）' : '';
                echo '<label><input type="checkbox" name="gh_purchase_option[' . esc_attr( $group_index ) . '][]" value="' . esc_attr( $option_index ) . '"' . checked( $option['default'], true, false ) . '> ' . esc_html( $option['label'] . $price ) . '</label>';
            }
            echo '</div>';
        }
        echo '</fieldset>';
    }
    echo '</div>';
}, 20 );

add_filter( 'woocommerce_add_to_cart_validation', function( $passed, $product_id ) {
    $groups = gh_crm_purchase_option_groups( $product_id );
    if ( empty( $groups ) ) return $passed;
    if ( empty( $_POST['gh_purchase_options_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['gh_purchase_options_nonce'] ) ), 'gh_purchase_options' ) ) {
        wc_add_notice( '商品選項驗證失敗，請重新整理後再試。', 'error' );
        return false;
    }
    $posted = isset( $_POST['gh_purchase_option'] ) && is_array( $_POST['gh_purchase_option'] ) ? wp_unslash( $_POST['gh_purchase_option'] ) : array();
    foreach ( $groups as $group_index => $group ) {
        $values = isset( $posted[ $group_index ] ) ? array_filter( (array) $posted[ $group_index ], function( $value ) use ( $group ) { return is_scalar( $value ) && ctype_digit( (string) $value ) && isset( $group['options'][ absint( $value ) ] ); } ) : array();
        if ( $group['required'] && empty( $values ) ) {
            wc_add_notice( '請選擇「' . esc_html( $group['name'] ) . '」。', 'error' );
            return false;
        }
        if ( $group['selection_mode'] === 'single' && count( $values ) > 1 ) {
            wc_add_notice( '「' . esc_html( $group['name'] ) . '」只能選擇一項。', 'error' );
            return false;
        }
    }
    return $passed;
}, 10, 2 );

add_filter( 'woocommerce_add_cart_item_data', function( $cart_item_data, $product_id, $variation_id ) {
    $groups = gh_crm_purchase_option_groups( $product_id );
    $posted = isset( $_POST['gh_purchase_option'] ) && is_array( $_POST['gh_purchase_option'] ) ? wp_unslash( $_POST['gh_purchase_option'] ) : array();
    $selected = array();
    $adjustment = 0;
    foreach ( $groups as $group_index => $group ) {
        $values = isset( $posted[ $group_index ] ) ? array_unique( array_map( 'absint', array_filter( (array) $posted[ $group_index ], function( $value ) use ( $group ) { return is_scalar( $value ) && ctype_digit( (string) $value ) && isset( $group['options'][ absint( $value ) ] ); } ) ) ) : array();
        if ( $group['selection_mode'] === 'single' ) $values = array_slice( $values, 0, 1 );
        $labels = array();
        foreach ( $values as $value ) {
            if ( ! isset( $group['options'][ $value ] ) ) continue;
            $labels[] = $group['options'][ $value ]['label'];
            $adjustment += (float) $group['options'][ $value ]['price_adjustment'];
        }
        if ( ! empty( $labels ) ) $selected[] = array( 'name' => $group['name'], 'values' => $labels );
    }
    if ( ! empty( $selected ) ) {
        $cart_item_data['gh_purchase_options'] = $selected;
        $cart_item_data['gh_purchase_options_adjustment'] = $adjustment;
        $priced_product = wc_get_product( $variation_id ?: $product_id );
        $cart_item_data['gh_purchase_options_base_price'] = $priced_product ? (float) $priced_product->get_price() : 0;
        $cart_item_data['gh_purchase_options_key'] = wp_generate_uuid4();
    }
    return $cart_item_data;
}, 10, 3 );

add_action( 'woocommerce_before_calculate_totals', function( $cart ) {
    if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return;
    foreach ( $cart->get_cart() as $cart_item ) {
        $adjustment = (float) ( $cart_item['gh_purchase_options_adjustment'] ?? 0 );
        if ( $adjustment <= 0 || empty( $cart_item['data'] ) ) continue;
        $base_price = (float) ( $cart_item['gh_purchase_options_base_price'] ?? $cart_item['data']->get_price() );
        $cart_item['data']->set_price( $base_price + $adjustment );
    }
}, 20 );

add_filter( 'woocommerce_get_item_data', function( $item_data, $cart_item ) {
    foreach ( (array) ( $cart_item['gh_purchase_options'] ?? array() ) as $selection ) {
        $item_data[] = array( 'key' => $selection['name'], 'value' => implode( '、', (array) $selection['values'] ) );
    }
    return $item_data;
}, 10, 2 );

add_action( 'woocommerce_checkout_create_order_line_item', function( $item, $cart_item_key, $values ) {
    foreach ( (array) ( $values['gh_purchase_options'] ?? array() ) as $selection ) {
        $item->add_meta_data( $selection['name'], implode( '、', (array) $selection['values'] ), true );
    }
}, 10, 3 );

add_action( 'wp_head', function() {
    if ( ! function_exists( 'is_product' ) || ! is_product() ) return;
    echo '<style>.gh-purchase-options{margin:18px 0;padding:16px;border:1px solid #d8dee8;border-radius:10px;background:#f8fafc}.gh-purchase-options h3{margin:0 0 12px;font-size:17px}.gh-purchase-option{margin:0 0 12px;padding:0;border:0}.gh-purchase-option:last-child{margin-bottom:0}.gh-purchase-option legend{margin-bottom:6px;font-weight:600}.gh-purchase-option select{width:100%;min-height:44px}.gh-purchase-option__description{margin:0 0 8px;color:#64748b;font-size:13px}.gh-purchase-option__checks{display:grid;gap:7px}.gh-purchase-option__checks label{display:flex;align-items:center;gap:6px}.gh-purchase-option .required{color:#dc2626}</style>';
} );
`
