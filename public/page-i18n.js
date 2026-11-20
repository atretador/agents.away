// Translations for the pages shown before the app is reachable (onboard.html, unpaired.html). Elements with
// data-i18n="key" get their content replaced; English stays in the HTML. Same language choice as the app
// (its ⚙ setting where this origin has one, else the phone's language).
(() => {
  const T = {
    es: {
      setupTitle: "Configurar Agents Away",
      setupH: "Configura Agents Away",
      setupSub: "Solo hace falta hacerlo una vez por teléfono.",
      s1h: "Descarga el certificado",
      s1: "Permite que el teléfono confíe en el HTTPS del PC (necesario para las notificaciones). Es un certificado privado creado en tu PC. Cuando el teléfono muestre los detalles del certificado, comprueba que su huella SHA-256 coincide con la que mostró <code>agents-away pair</code> en el PC.",
      s1b: "Descargar certificado",
      s2h: "Instálalo",
      s2: "<b>Android:</b><ol><li>Ajustes → Seguridad y privacidad → Más ajustes de seguridad → Cifrado y credenciales</li><li>Instalar un certificado → <b>Certificado de CA</b> → Instalar de todos modos → elige <code>agents-away-ca.crt</code></li></ol><b>iPhone:</b><ol><li>Ajustes → Perfil descargado → Instalar</li><li>Ajustes → General → Información → Ajustes de confianza de certificados → activa “Agents Away local CA”</li></ol>",
      s3h: "Vincula",
      s3: "En el PC ejecuta <code>agents-away pair</code> y escanea el segundo código QR (el enlace de vinculación). Luego usa el menú del navegador → <b>Añadir a pantalla de inicio</b>, abre Agents Away desde la pantalla de inicio y toca <b>Activar</b> para las notificaciones.",
      s3b: "Abrir Agents Away",
      unpaired: "Este teléfono no tiene sesión iniciada, o su acceso caducó.",
      unpairedHow: "En el PC, ejecuta <code>agents-away pair</code> y escanea el código QR de <b>vinculación</b>, o abre el enlace de vinculación que muestra. Los enlaces de vinculación funcionan una vez, durante 10 minutos.",
    },
    "pt-BR": {
      setupTitle: "Configurar o Agents Away",
      setupH: "Configure o Agents Away",
      setupSub: "Você só precisa fazer isto uma vez por celular.",
      s1h: "Baixe o certificado",
      s1: "Ele faz o celular confiar no HTTPS do PC (necessário para as notificações). É um certificado privado criado no seu PC. Quando o celular mostrar os detalhes do certificado, confira se a impressão digital SHA-256 é a mesma que o <code>agents-away pair</code> mostrou no PC.",
      s1b: "Baixar certificado",
      s2h: "Instale",
      s2: "<b>Android:</b><ol><li>Configurações → Segurança e privacidade → Mais configurações de segurança → Criptografia e credenciais</li><li>Instalar um certificado → <b>Certificado CA</b> → Instalar mesmo assim → escolha <code>agents-away-ca.crt</code></li></ol><b>iPhone:</b><ol><li>Ajustes → Perfil Transferido → Instalar</li><li>Ajustes → Geral → Sobre → Ajustes de Confiança de Certificados → ative “Agents Away local CA”</li></ol>",
      s3h: "Pareie",
      s3: "No PC, rode <code>agents-away pair</code> e escaneie o segundo QR code (o link de pareamento). Depois use o menu do navegador → <b>Adicionar à tela inicial</b>, abra o Agents Away pela tela inicial e toque em <b>Ativar</b> para as notificações.",
      s3b: "Abrir o Agents Away",
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
