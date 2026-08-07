<?php
/**
 * Plugin Name: GH WooCommerce Order Invoice Download
 * Description: Show the invoice uploaded from GH CRM on the customer's order details page.
 */

defined('ABSPATH') || exit;

function gh_order_invoice_download_card($order) {
    if (!$order instanceof WC_Order || !is_user_logged_in()) {
        return;
    }

    $current_user_id = get_current_user_id();
    $owns_order = (int) $order->get_customer_id() === $current_user_id;
    if (!$owns_order && !current_user_can('edit_shop_orders')) {
        return;
    }

    $invoice_url = esc_url($order->get_meta('_gh_invoice_pdf'));
    $invoice_no = sanitize_text_field($order->get_meta('_gh_invoice_number'));
    $invoice_date = sanitize_text_field($order->get_meta('_gh_invoice_date'));

    if (!$invoice_url) {
        return;
    }

    echo '<section class="woocommerce-order-invoice gh-order-invoice" style="margin:24px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;background:#fff">';
    echo '<h2 style="margin:0 0 12px;font-size:20px">&#38651;&#23376;&#30332;&#31080;</h2>';
    echo '<p style="margin:0 0 14px;color:#4b5563">';
    if ($invoice_no) {
        echo '&#30332;&#31080;&#34399;&#30908;&#65306;<strong>' . esc_html($invoice_no) . '</strong>';
    }
    if ($invoice_date) {
        echo ($invoice_no ? '<br>' : '') . '&#38283;&#31435;&#26085;&#26399;&#65306;' . esc_html($invoice_date);
    }
    echo '</p>';
    echo '<a class="button" href="' . $invoice_url . '" target="_blank" rel="noopener noreferrer" download>&#19979;&#36617;&#30332;&#31080; PDF</a>';
    echo '</section>';
}

add_action('woocommerce_order_details_after_order_table', 'gh_order_invoice_download_card', 20);
