#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <wrl.h>
#include <atomic>
#include <string>
#include <vector>
#include <algorithm>
#include "WebView2.h"
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Callback;
static HMODULE module;
static std::atomic<long> objects{0};
static const CLSID previewClsid={0x726747eb,0x6a31,0x4bf2,{0x89,0x8f,0x11,0x62,0x08,0x14,0xc1,0xf2}};
static const wchar_t* clsid=L"{726747EB-6A31-4BF2-898F-11620814C1F2}";
static const wchar_t* previewKey=L"\\shellex\\{8895b1c6-b41f-4c1c-a562-0d564250836f}";
static std::wstring modulePath(){wchar_t path[32768];DWORD size=GetModuleFileNameW(module,path,32768);return std::wstring(path,size);}
static std::wstring directory(){auto path=modulePath();return path.substr(0,path.find_last_of(L"\\/"));}
static std::wstring quoted(const std::wstring& value){
 std::wstring out=L"\"";wchar_t hex[7];
 for(wchar_t c:value){if(c==L'"'||c==L'\\'){out+=L'\\';out+=c;}else if(c<32||(c>=0xd800&&c<=0xdfff)){swprintf_s(hex,L"\\u%04x",static_cast<unsigned>(c));out+=hex;}else out+=c;}
 return out+L"\"";
}
static std::wstring regGet(const std::wstring& key,const wchar_t* name=nullptr){
 DWORD size=0,type=0;if(RegGetValueW(HKEY_CURRENT_USER,key.c_str(),name,RRF_RT_REG_SZ,&type,nullptr,&size)!=ERROR_SUCCESS)return L"";
 std::vector<wchar_t> data(size/2+1);if(RegGetValueW(HKEY_CURRENT_USER,key.c_str(),name,RRF_RT_REG_SZ,&type,data.data(),&size)!=ERROR_SUCCESS)return L"";return data.data();
}
static LONG regSet(const std::wstring& key,const wchar_t* name,const std::wstring& value){HKEY handle;LONG result=RegCreateKeyExW(HKEY_CURRENT_USER,key.c_str(),0,nullptr,0,KEY_SET_VALUE,nullptr,&handle,nullptr);if(result)return result;result=RegSetValueExW(handle,name,0,REG_SZ,reinterpret_cast<const BYTE*>(value.c_str()),static_cast<DWORD>((value.size()+1)*2));RegCloseKey(handle);return result;}
static HRESULT registration(bool enable,bool extensions){
 const std::wstring root=L"Software\\Classes\\CLSID\\"+std::wstring(clsid), list=L"Software\\Microsoft\\Windows\\CurrentVersion\\PreviewHandlers";
 if(!enable&&_wcsicmp(regGet(root+L"\\InprocServer32").c_str(),modulePath().c_str())!=0)return S_OK;
 if(enable){
  if(regSet(root,nullptr,L"Open Typora Markdown Preview")||regSet(root,L"AppID",L"{6d2b5079-2f0b-48dd-ab7f-97cec514d30b}")||regSet(root+L"\\InprocServer32",nullptr,modulePath())||regSet(root+L"\\InprocServer32",L"ThreadingModel",L"Apartment")||regSet(list,clsid,L"Open Typora Markdown Preview"))return E_ACCESSDENIED;
 }
 for(auto ext:{L".md",L".markdown",L".mdown"}){
  const std::wstring path=L"Software\\Classes\\"+std::wstring(ext)+previewKey, backup=L"Software\\Open Typora\\PreviewBackup\\"+std::wstring(ext);
  auto current=regGet(path);
  if(enable&&extensions&&current!=clsid){
   if(regGet(backup,L"Saved").empty()){regSet(backup,L"Previous",current);regSet(backup,L"Saved",L"1");}
   if(regSet(path,nullptr,clsid))return E_ACCESSDENIED;
  }else if(!enable){
   if(current==clsid){auto previous=regGet(backup,L"Previous");if(previous.empty())RegDeleteTreeW(HKEY_CURRENT_USER,path.c_str());else regSet(path,nullptr,previous);}
   RegDeleteTreeW(HKEY_CURRENT_USER,backup.c_str());
  }
 }
 if(!enable){RegDeleteTreeW(HKEY_CURRENT_USER,root.c_str());HKEY handle;if(RegOpenKeyExW(HKEY_CURRENT_USER,list.c_str(),0,KEY_SET_VALUE,&handle)==ERROR_SUCCESS){RegDeleteValueW(handle,clsid);RegCloseKey(handle);}}
 SHChangeNotify(SHCNE_ASSOCCHANGED,SHCNF_IDLIST,nullptr,nullptr);return S_OK;
}
class Preview final:public IPreviewHandler,public IInitializeWithStream,public IInitializeWithFile,public IObjectWithSite,public IOleWindow,public IPreviewHandlerVisuals{
 std::atomic<ULONG> refs{1};HWND parent=nullptr,window=nullptr;RECT rect{};unsigned generation=0;
 ComPtr<IStream> stream;std::wstring filename;
 ComPtr<IUnknown> site;ComPtr<IPreviewHandlerFrame> frame;
 ComPtr<ICoreWebView2Environment> environment;ComPtr<ICoreWebView2Controller> controller;ComPtr<ICoreWebView2> web;
 EventRegistrationToken resourcesToken{},messageToken{},navigationToken{},newWindowToken{};
 COLORREF background=RGB(255,255,255),foreground=RGB(45,45,45);
 std::wstring payload;bool truncated=false;
 void resize(){if(window)MoveWindow(window,rect.left,rect.top,std::max<LONG>(1,rect.right-rect.left),std::max<LONG>(1,rect.bottom-rect.top),TRUE);if(controller){RECT area{};GetClientRect(window,&area);controller->put_Bounds(area);}}
 void failure(HRESULT result){if(window){wchar_t text[180];swprintf_s(text,L"Markdown preview could not start (0x%08X). Microsoft Edge WebView2 Runtime is required.",static_cast<unsigned>(result));SetWindowTextW(window,text);}}
 HRESULT read(){
  if(!stream){HRESULT result=SHCreateStreamOnFileEx(filename.c_str(),STGM_READ|STGM_SHARE_DENY_NONE,FILE_ATTRIBUTE_NORMAL,FALSE,nullptr,&stream);if(FAILED(result))return result;}
  LARGE_INTEGER zero{};stream->Seek(zero,STREAM_SEEK_SET,nullptr);STATSTG stat{};
  if(SUCCEEDED(stream->Stat(&stat,STATFLAG_DEFAULT))){truncated=stat.cbSize.QuadPart>1024*1024;if(filename.empty()&&stat.pwcsName&&PathIsRelativeW(stat.pwcsName)==FALSE)filename=stat.pwcsName;CoTaskMemFree(stat.pwcsName);}
  std::vector<char> bytes(1024*1024);ULONG count=0;HRESULT result=stream->Read(bytes.data(),static_cast<ULONG>(bytes.size()),&count);if(FAILED(result))return result;
  std::wstring source;size_t offset=0;
  if(count>=2&&((static_cast<unsigned char>(bytes[0])==0xff&&static_cast<unsigned char>(bytes[1])==0xfe)||(static_cast<unsigned char>(bytes[0])==0xfe&&static_cast<unsigned char>(bytes[1])==0xff))){
   bool little=static_cast<unsigned char>(bytes[0])==0xff;for(size_t i=2;i+1<count;i+=2){unsigned a=static_cast<unsigned char>(bytes[i]),b=static_cast<unsigned char>(bytes[i+1]);source+=static_cast<wchar_t>(little?a|(b<<8):(a<<8)|b);}
  }else{
   if(count>=3&&static_cast<unsigned char>(bytes[0])==0xef&&static_cast<unsigned char>(bytes[1])==0xbb&&static_cast<unsigned char>(bytes[2])==0xbf)offset=3;
   UINT encoding=CP_UTF8;int size=MultiByteToWideChar(encoding,MB_ERR_INVALID_CHARS,bytes.data()+offset,count-static_cast<int>(offset),nullptr,0);
   if(!size&&!truncated&&!offset){encoding=54936;size=MultiByteToWideChar(encoding,0,bytes.data(),count,nullptr,0);}
   if(!size)size=MultiByteToWideChar(CP_UTF8,0,bytes.data()+offset,count-static_cast<int>(offset),nullptr,0);
   source.resize(size);if(size)MultiByteToWideChar(encoding,0,bytes.data()+offset,count-static_cast<int>(offset),source.data(),size);
  }
  payload=L"{\"source\":"+quoted(source)+L",\"truncated\":"+(truncated?L"true":L"false")+L",\"name\":"+quoted(PathFindFileNameW(filename.c_str()))+L",\"base\":"+quoted(filename.empty()?L"":L"https://document.opentypora.local/")+L"}";return S_OK;
 }
 HRESULT configure(){
  ComPtr<ICoreWebView2Settings> settings;web->get_Settings(&settings);settings->put_AreDefaultContextMenusEnabled(FALSE);settings->put_AreDevToolsEnabled(FALSE);settings->put_IsStatusBarEnabled(FALSE);
  ComPtr<ICoreWebView2_3> mapping;if(FAILED(web.As(&mapping)))return E_NOINTERFACE;
  HRESULT result=mapping->SetVirtualHostNameToFolderMapping(L"app.opentypora.local",(directory()+L"\\dist").c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);if(FAILED(result))return result;
  if(!filename.empty()) { const auto slash=filename.find_last_of(L"\\/"); if(slash!=std::wstring::npos)mapping->SetVirtualHostNameToFolderMapping(L"document.opentypora.local",filename.substr(0,slash).c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS); }
  web->AddWebResourceRequestedFilter(L"*",COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
  web->add_WebResourceRequested(Callback<ICoreWebView2WebResourceRequestedEventHandler>([this](ICoreWebView2*,ICoreWebView2WebResourceRequestedEventArgs* args)->HRESULT{
   ComPtr<ICoreWebView2WebResourceRequest> request;args->get_Request(&request);LPWSTR uri=nullptr;request->get_Uri(&uri);std::wstring address=uri?uri:L"";CoTaskMemFree(uri);
   COREWEBVIEW2_WEB_RESOURCE_CONTEXT context;args->get_ResourceContext(&context);
   const bool localImage=!filename.empty()&&context==COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE&&address.rfind(L"https://document.opentypora.local/",0)==0;
   if(!localImage&&address.rfind(L"https://app.opentypora.local/",0)!=0&&address.rfind(L"data:",0)!=0){ComPtr<ICoreWebView2WebResourceResponse> blocked;environment->CreateWebResourceResponse(nullptr,403,L"Blocked",L"",&blocked);args->put_Response(blocked.Get());}return S_OK;
  }).Get(),&resourcesToken);
  web->add_NavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>([](ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs* args)->HRESULT{LPWSTR uri=nullptr;args->get_Uri(&uri);bool allowed=uri&&std::wstring(uri)==L"https://app.opentypora.local/preview.html";CoTaskMemFree(uri);args->put_Cancel(!allowed);return S_OK;}).Get(),&navigationToken);
  web->add_NewWindowRequested(Callback<ICoreWebView2NewWindowRequestedEventHandler>([](ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs* args)->HRESULT{args->put_Handled(TRUE);return S_OK;}).Get(),&newWindowToken);
  web->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>([this](ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs* args)->HRESULT{LPWSTR message=nullptr;if(SUCCEEDED(args->TryGetWebMessageAsString(&message))){if(message&&std::wstring(message)==L"ready"&&web)web->PostWebMessageAsJson(payload.c_str());CoTaskMemFree(message);}return S_OK;}).Get(),&messageToken);
  resize();return web->Navigate(L"https://app.opentypora.local/preview.html");
 }
public:
 Preview(){objects++;}~Preview(){Unload();objects--;}
 IFACEMETHODIMP QueryInterface(REFIID id,void** out)override{if(!out)return E_POINTER;*out=nullptr;if(id==IID_IUnknown||id==__uuidof(IPreviewHandler))*out=static_cast<IPreviewHandler*>(this);else if(id==__uuidof(IInitializeWithStream))*out=static_cast<IInitializeWithStream*>(this);else if(id==__uuidof(IInitializeWithFile))*out=static_cast<IInitializeWithFile*>(this);else if(id==__uuidof(IObjectWithSite))*out=static_cast<IObjectWithSite*>(this);else if(id==__uuidof(IOleWindow))*out=static_cast<IOleWindow*>(this);else if(id==__uuidof(IPreviewHandlerVisuals))*out=static_cast<IPreviewHandlerVisuals*>(this);else return E_NOINTERFACE;AddRef();return S_OK;}
 IFACEMETHODIMP_(ULONG) AddRef()override{return ++refs;}IFACEMETHODIMP_(ULONG) Release()override{ULONG count=--refs;if(!count)delete this;return count;}
 IFACEMETHODIMP Initialize(IStream* input,DWORD)override{if(!input)return E_INVALIDARG;if(stream||!filename.empty())return HRESULT_FROM_WIN32(ERROR_ALREADY_INITIALIZED);stream=input;return S_OK;}
 IFACEMETHODIMP Initialize(LPCWSTR file,DWORD)override{if(!file)return E_INVALIDARG;if(stream||!filename.empty())return HRESULT_FROM_WIN32(ERROR_ALREADY_INITIALIZED);filename=file;return S_OK;}
 IFACEMETHODIMP SetSite(IUnknown* input)override{site=input;frame.Reset();if(site)site.As(&frame);return S_OK;}
 IFACEMETHODIMP GetSite(REFIID id,void** out)override{return site?site->QueryInterface(id,out):E_FAIL;}
 IFACEMETHODIMP GetWindow(HWND* out)override{if(!out)return E_POINTER;*out=window;return window?S_OK:E_FAIL;}
 IFACEMETHODIMP ContextSensitiveHelp(BOOL)override{return E_NOTIMPL;}
 IFACEMETHODIMP SetWindow(HWND input,const RECT* bounds)override{if(!input||!bounds)return E_INVALIDARG;parent=input;rect=*bounds;if(window)SetParent(window,parent);resize();return S_OK;}
 IFACEMETHODIMP SetRect(const RECT* bounds)override{if(!bounds)return E_POINTER;rect=*bounds;resize();return S_OK;}
 IFACEMETHODIMP DoPreview()override{
  if(window||!parent||(!stream&&filename.empty()))return E_UNEXPECTED;
  HRESULT result=read();if(FAILED(result))return result;
  window=CreateWindowExW(0,L"STATIC",L"Loading Markdown preview...",WS_CHILD|WS_VISIBLE|WS_CLIPCHILDREN,0,0,1,1,parent,nullptr,module,nullptr);if(!window)return HRESULT_FROM_WIN32(GetLastError());resize();
  PWSTR low=nullptr;result=SHGetKnownFolderPath(FOLDERID_LocalAppDataLow,KF_FLAG_CREATE,nullptr,&low);if(FAILED(result))return result;
  std::wstring userData=std::wstring(low)+L"\\OpenTyporaPreview";CoTaskMemFree(low);SHCreateDirectoryExW(nullptr,userData.c_str(),nullptr);
  const unsigned token=++generation;ComPtr<IPreviewHandler> alive(this);
  result=CreateCoreWebView2EnvironmentWithOptions(nullptr,userData.c_str(),nullptr,Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>([this,token,alive](HRESULT status,ICoreWebView2Environment* input)->HRESULT{
   if(token!=generation||!window)return S_OK;if(FAILED(status)||!input){failure(status);return S_OK;}environment=input;
   HRESULT created=environment->CreateCoreWebView2Controller(window,Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>([this,token,alive](HRESULT status,ICoreWebView2Controller* input)->HRESULT{
    if(token!=generation||!window){if(input)input->Close();return S_OK;}if(FAILED(status)||!input){failure(status);return S_OK;}controller=input;controller->get_CoreWebView2(&web);HRESULT configured=configure();if(FAILED(configured))failure(configured);return S_OK;
   }).Get());if(FAILED(created))failure(created);return S_OK;
  }).Get());if(FAILED(result))failure(result);return result;
 }
 IFACEMETHODIMP Unload()override{generation++;if(web){web->remove_WebResourceRequested(resourcesToken);web->remove_WebMessageReceived(messageToken);web->remove_NavigationStarting(navigationToken);web->remove_NewWindowRequested(newWindowToken);}if(controller)controller->Close();web.Reset();controller.Reset();environment.Reset();stream.Reset();filename.clear();payload.clear();if(window){DestroyWindow(window);window=nullptr;}return S_OK;}
 IFACEMETHODIMP SetFocus()override{if(controller)controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);else if(window)::SetFocus(window);return S_OK;}
 IFACEMETHODIMP QueryFocus(HWND* out)override{if(!out)return E_POINTER;*out=::GetFocus();return S_OK;}
 IFACEMETHODIMP TranslateAccelerator(MSG* message)override{return frame?frame->TranslateAccelerator(message):S_FALSE;}
 IFACEMETHODIMP SetBackgroundColor(COLORREF value)override{background=value;return S_OK;}
 IFACEMETHODIMP SetFont(const LOGFONTW*)override{return S_OK;}
 IFACEMETHODIMP SetTextColor(COLORREF value)override{foreground=value;return S_OK;}
};
class Factory final:public IClassFactory{
 std::atomic<ULONG> refs{1};public:Factory(){objects++;}~Factory(){objects--;}
 IFACEMETHODIMP QueryInterface(REFIID id,void** out)override{if(!out)return E_POINTER;*out=nullptr;if(id!=IID_IUnknown&&id!=IID_IClassFactory)return E_NOINTERFACE;*out=this;AddRef();return S_OK;}
 IFACEMETHODIMP_(ULONG) AddRef()override{return ++refs;}IFACEMETHODIMP_(ULONG) Release()override{ULONG count=--refs;if(!count)delete this;return count;}
 IFACEMETHODIMP CreateInstance(IUnknown* outer,REFIID id,void** out)override{if(outer)return CLASS_E_NOAGGREGATION;auto instance=new(std::nothrow)Preview();if(!instance)return E_OUTOFMEMORY;HRESULT result=instance->QueryInterface(id,out);instance->Release();return result;}
 IFACEMETHODIMP LockServer(BOOL lock)override{if(lock)objects++;else objects--;return S_OK;}
};
extern "C" BOOL WINAPI DllMain(HINSTANCE handle,DWORD reason,void*){if(reason==DLL_PROCESS_ATTACH){module=handle;DisableThreadLibraryCalls(handle);}return TRUE;}
extern "C" HRESULT WINAPI DllCanUnloadNow(){return objects==0?S_OK:S_FALSE;}
extern "C" HRESULT WINAPI DllGetClassObject(REFCLSID id,REFIID iid,void** out){if(id!=previewClsid)return CLASS_E_CLASSNOTAVAILABLE;auto factory=new(std::nothrow)Factory();if(!factory)return E_OUTOFMEMORY;HRESULT result=factory->QueryInterface(iid,out);factory->Release();return result;}
extern "C" HRESULT WINAPI DllRegisterServer(){return registration(true,true);}
extern "C" HRESULT WINAPI DllUnregisterServer(){return registration(false,true);}
extern "C" HRESULT WINAPI DllInstall(BOOL install,LPCWSTR command){return registration(install!=FALSE,!(command&&std::wstring(command)==L"refresh"));}
