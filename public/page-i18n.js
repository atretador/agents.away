// Translations for the pages shown before the app is reachable (onboard.html, unpaired.html). Elements with
// data-i18n="key" get their content replaced; English stays in the HTML. Same language choice as the app
// (its ⚙ setting where this origin has one, else the phone's language).
(() => {
  const T = {
    es: {
      setupTitle: "Configurar Agents Away",
      setupH: "Configura Agents Away",
      setupSub: "Una vez por teléfono, unos dos minutos.",
      appTab: "App de Android",
      appTabSub: "Sin certificado que instalar · cambia entre PC",
      webTab: "App web",
      webTabSub: "iPhone o cualquier navegador · necesita un certificado",
      req: "Obligatorio",
      rec: "Recomendado",
      appNote: "No hace falta certificado: el código de vinculación le dice a la app en qué certificado confiar, solo para este PC.",
      a1h: "Instala la app",
      a1: "Descárgala, abre el archivo e instálala. Android te pedirá permitir que el navegador instale apps: permítelo para esta instalación.",
      a1b: "Descargar la app",
      a1check: "Comprobar la descarga",
      a1sha: "Su SHA-256 debe coincidir con <code>agents-away apk status</code> en el PC:",
      a2h: "Vincúlala con este PC",
      a2: "En el PC ejecuta <code>agents-away pair</code>. En la app toca <b>Escanear código QR</b> y escanea el <b>segundo</b> código QR (el enlace de vinculación). Funciona una vez, durante 10 minutos.",
      a3h: "Permite las notificaciones",
      a3: "Cuando la app lo pida, permite las notificaciones y deja que funcione sin restricciones de batería, para que te avise cuando una sesión te necesite.",
      webIntro: "La app web funciona en tu navegador y se añade a la pantalla de inicio. Antes, el teléfono tiene que confiar en el certificado privado de tu PC.",
      w1h: "Descarga el certificado",
      w1: "Permite que este teléfono confíe en el HTTPS de tu PC (necesario para las notificaciones). Se crea en tu PC y solo puede responder por direcciones locales.",
      w1b: "Descargar certificado",
      w1check: "Comprobar la huella",
      w1fp: "Cuando el teléfono muestre los detalles del certificado, su huella SHA-256 debe coincidir con la que muestra <code>agents-away pair</code> en el PC.",
      w2h: "Instala el certificado",
      w2android: "<ol><li>Ajustes → Seguridad y privacidad → Más ajustes de seguridad → Cifrado y credenciales</li><li>Instalar un certificado → <b>Certificado de CA</b> → Instalar de todos modos → elige <code>agents-away-ca.crt</code></li></ol>",
      w2ios: "<ol><li>Ajustes → Perfil descargado → Instalar</li><li>Ajustes → General → Información → Ajustes de confianza de certificados → activa “Agents Away local CA”</li></ol>",
      w3h: "Vincula",
      w3: "En el PC ejecuta <code>agents-away pair</code> y escanea el <b>segundo</b> código QR (el enlace de vinculación) con la cámara. Funciona una vez, durante 10 minutos.",
      w4h: "Añádela a la pantalla de inicio",
      w4: "Menú del navegador → <b>Añadir a pantalla de inicio</b> (iPhone: Compartir → <b>Añadir a pantalla de inicio</b>). Ábrela desde ahí y toca <b>Activar</b> para las notificaciones.",
      w4b: "Abrir Agents Away",
      foot: "Solo para tu propio teléfono, en tu red doméstica o tu VPN.",
      unpaired: "Este teléfono no tiene sesión iniciada, o su acceso caducó.",
      unpairedHow: "En el PC, ejecuta <code>agents-away pair</code> y escanea el código QR de <b>vinculación</b>, o abre el enlace de vinculación que muestra. Los enlaces de vinculación funcionan una vez, durante 10 minutos.",
    },
    "pt-BR": {
      setupTitle: "Configurar o Agents Away",
      setupH: "Configure o Agents Away",
      setupSub: "Uma vez por celular, uns dois minutos.",
      appTab: "App Android",
      appTabSub: "Sem certificado para instalar · alterna entre PCs",
      webTab: "App web",
      webTabSub: "iPhone ou qualquer navegador · precisa de um certificado",
      req: "Obrigatório",
      rec: "Recomendado",
      appNote: "Não precisa de certificado: o código de pareamento diz ao app em qual certificado confiar, só para este PC.",
      a1h: "Instale o app",
      a1: "Baixe, abra o arquivo e instale. O Android vai pedir para permitir que o navegador instale apps: permita para esta instalação.",
      a1b: "Baixar o app",
      a1check: "Conferir o download",
      a1sha: "O SHA-256 dele deve ser igual ao de <code>agents-away apk status</code> no PC:",
      a2h: "Pareie com este PC",
      a2: "No PC, rode <code>agents-away pair</code>. No app, toque em <b>Escanear QR code</b> e escaneie o <b>segundo</b> QR code (o link de pareamento). Ele funciona uma vez, por 10 minutos.",
      a3h: "Permita as notificações",
      a3: "Quando o app pedir, permita as notificações e deixe ele rodar sem restrições de bateria, para ele avisar quando uma sessão precisar de você.",
      webIntro: "O app web roda no navegador e é adicionado à tela inicial. Antes, o celular precisa confiar no certificado privado do seu PC.",
      w1h: "Baixe o certificado",
      w1: "Ele faz este celular confiar no HTTPS do seu PC (necessário para as notificações). É criado no seu PC e só vale para endereços locais.",
      w1b: "Baixar certificado",
      w1check: "Conferir a impressão digital",
      w1fp: "Quando o celular mostrar os detalhes do certificado, a impressão digital SHA-256 dele deve ser igual à que o <code>agents-away pair</code> mostra no PC.",
      w2h: "Instale o certificado",
      w2android: "<ol><li>Configurações → Segurança e privacidade → Mais configurações de segurança → Criptografia e credenciais</li><li>Instalar um certificado → <b>Certificado CA</b> → Instalar mesmo assim → escolha <code>agents-away-ca.crt</code></li></ol>",
      w2ios: "<ol><li>Ajustes → Perfil Transferido → Instalar</li><li>Ajustes → Geral → Sobre → Ajustes de Confiança de Certificados → ative “Agents Away local CA”</li></ol>",
      w3h: "Pareie",
      w3: "No PC, rode <code>agents-away pair</code> e escaneie o <b>segundo</b> QR code (o link de pareamento) com a câmera. Ele funciona uma vez, por 10 minutos.",
      w4h: "Adicione à tela inicial",
      w4: "Menu do navegador → <b>Adicionar à tela inicial</b> (iPhone: Compartilhar → <b>Adicionar à Tela de Início</b>). Abra por lá e toque em <b>Ativar</b> para as notificações.",
      w4b: "Abrir o Agents Away",
      foot: "Só para o seu próprio celular, na sua rede de casa ou na sua VPN.",
      unpaired: "Este celular não está conectado, ou o acesso dele expirou.",
      unpairedHow: "No PC, rode <code>agents-away pair</code> e escaneie o QR code de <b>pareamento</b>, ou abra o link de pareamento que ele mostra. Links de pareamento funcionam uma vez, por 10 minutos.",
    },
  };
  let pref = "auto";
  try { pref = localStorage.getItem("away.lang") || "auto"; } catch {}
  let lang = pref === "auto" ? "en" : pref;
  if (pref === "auto") {
    for (const l of navigator.languages ?? [navigator.language ?? "en"]) {
      const x = String(l).toLowerCase();
      if (x.startsWith("es")) { lang = "es"; break; }
      if (x.startsWith("pt")) { lang = "pt-BR"; break; }
      if (x.startsWith("en")) break;
    }
  }
  const d = T[lang];
  if (!d) return;
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const v = d[el.dataset.i18n];
    if (v == null) continue;
    if (el.tagName === "TITLE") document.title = v; else el.innerHTML = v;
  }
})();
