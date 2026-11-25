package se.aistudio.radio;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Aurora Radio — Play Billing plugin.
 *
 * Plans (must exist in Play Console -> Monetize -> Products):
 *   premium_monthly  (subscription)
 *   premium_yearly   (subscription)
 *   premium_lifetime (one-time in-app)
 *
 * JS API (window.Capacitor.Plugins.AuroraBilling):
 *   billingReady()      -> products loaded
 *   buyPlan(plan)       -> plan in {monthly, yearly, lifetime}
 *   restorePurchases()
 *
 * Events dispatched to the WebView:
 *   onBillingPurchase  {active:true}    — покупка/подписка активна
 *   onBillingFailed    {code}           — отмена или ошибка
 *   onBillingRestored  {active:boolean} — результат восстановления
 */
@CapacitorPlugin(name = "AuroraBilling")
public class AuroraBillingPlugin extends Plugin {

    private static final String TAG = "AuroraBilling";
    private static final String PRODUCT_MONTHLY = "premium_monthly";
    private static final String PRODUCT_YEARLY = "premium_yearly";
    private static final String PRODUCT_LIFETIME = "premium_lifetime";

    private BillingClient billingClient;
    private boolean billingConnected = false;
    private final Map<String, ProductDetails> billingProducts = new HashMap<>();

    @Override
    public void load() {
        initBilling();
    }

    private void initBilling() {
        if (getContext() == null) return;
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(new PurchasesUpdatedListener() {
                    @Override
                    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
                        onUpdated(result, purchases);
                    }
                })
                .enablePendingPurchases(PendingPurchasesParams.newBuilder()
                        .enableOneTimeProducts()
                        .enablePrepaidPlans()
                        .build())
                .build();
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                billingConnected = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                Log.d(TAG, "Billing setup: " + result.getResponseCode());
                if (billingConnected) {
                    queryProducts();
                    queryExistingPurchases();
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                billingConnected = false;
            }
        });
    }

    private void queryProducts() {
        if (!billingConnected) return;
        queryProductsForType(BillingClient.ProductType.INAPP, Arrays.asList(PRODUCT_LIFETIME));
        queryProductsForType(BillingClient.ProductType.SUBS, Arrays.asList(PRODUCT_MONTHLY, PRODUCT_YEARLY));
    }

    private void queryProductsForType(String type, List<String> ids) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : ids) {
            products.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(type)
                    .build());
        }
        billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                new ProductDetailsResponseListener() {
                    @Override
                    public void onProductDetailsResponse(BillingResult result, List<ProductDetails> list) {
                        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && list != null) {
                            for (ProductDetails d : list) billingProducts.put(d.getProductId(), d);
                            Log.d(TAG, "Billing products: " + billingProducts.keySet());
                        } else {
                            Log.d(TAG, "Billing products unavailable (" + type + "): " + result.getResponseCode());
                        }
                    }
                });
    }

    private void queryExistingPurchases() {
        if (!billingConnected) return;
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (result, purchases) -> handlePurchases(purchases, false));
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (result, purchases) -> handlePurchases(purchases, true));
    }

    private void onUpdated(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            handlePurchases(purchases, false);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            notifyJs("onBillingFailed", "{\"code\":\"canceled\"}");
        } else if (code != BillingClient.BillingResponseCode.OK) {
            notifyJs("onBillingFailed", "{\"code\":" + code + "}");
        }
    }

    private void handlePurchases(List<Purchase> purchases, boolean fromRestore) {
        if (purchases == null) return;
        boolean granted = false;
        for (Purchase p : purchases) {
            if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            granted = true;
            if (!p.isAcknowledged()) {
                AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(p.getPurchaseToken())
                        .build();
                billingClient.acknowledgePurchase(params, ref -> Log.d(TAG, "Purchase acknowledged"));
            }
        }
        if (fromRestore) {
            notifyJs("onBillingRestored", "{\"active\":" + granted + "}");
        } else if (granted) {
            notifyJs("onBillingPurchase", "{\"active\":true}");
        }
    }

    // ------------------------------------------------------------------ API

    @PluginMethod
    public void billingReady(PluginCall call) {
        call.resolve(new JSObject().put("ready", billingConnected && !billingProducts.isEmpty()));
    }

    @PluginMethod
    public void buyPlan(PluginCall call) {
        String plan = call.getString("plan");
        if (plan == null) { call.reject("plan required"); return; }
        if (!billingConnected || getActivity() == null) {
            call.reject("billing unavailable");
            notifyJs("onBillingFailed", "{\"code\":\"unavailable\"}");
            return;
        }
        String product;
        boolean isSub = false;
        if ("monthly".equals(plan)) { product = PRODUCT_MONTHLY; isSub = true; }
        else if ("yearly".equals(plan)) { product = PRODUCT_YEARLY; isSub = true; }
        else if ("lifetime".equals(plan)) { product = PRODUCT_LIFETIME; }
        else { call.reject("unknown plan"); return; }

        final ProductDetails details = billingProducts.get(product);
        if (details == null) {
            call.reject("product not loaded: " + product);
            notifyJs("onBillingFailed", "{\"code\":\"item_unavailable\"}");
            return;
        }
        final boolean subs = isSub;
        getActivity().runOnUiThread(() -> {
            BillingFlowParams.ProductDetailsParams.Builder pb = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details);
            if (subs && details.getSubscriptionOfferDetails() != null
                    && !details.getSubscriptionOfferDetails().isEmpty()) {
                pb.setOfferToken(details.getSubscriptionOfferDetails().get(0).getOfferToken());
            }
            billingClient.launchBillingFlow(getActivity(),
                    BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(Arrays.asList(pb.build()))
                            .build());
        });
        call.resolve(new JSObject().put("launched", true));
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        if (!billingConnected) {
            call.reject("billing unavailable");
            return;
        }
        queryExistingPurchases();
        call.resolve(new JSObject().put("ok", true));
    }

    // ---------------------------------------------------------------- helpers

    private void notifyJs(String event, String json) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + json + "}))", null));
    }
}