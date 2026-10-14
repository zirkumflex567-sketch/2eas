import MetaTrader5 as mt5

term_path = r"C:\Users\zirku\Documents\goldm5\.mt5-puprime\terminal64.exe"
if mt5.initialize(path=term_path, portable=True):
    info = mt5.account_info()
    if info:
        print("ONLINE CONNECTED!")
        print(f"Login: {info.login}, Name: {info.name}, Server: {info.server}, Balance: {info.balance} {info.currency}")
    else:
        print("account_info returned None")
    mt5.shutdown()
else:
    print("Failed to initialize:", mt5.last_error())
