# OG image fonts

1. Noto Sans TC Regular and Bold are from the official [Noto CJK repository](https://github.com/notofonts/noto-cjk), under SIL Open Font License 1.1. See `NotoSansTC-LICENSE.txt`.
2. Noto Emoji is from the official [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/notoemoji), under SIL Open Font License 1.1. See `NotoEmoji-OFL.txt`.
3. Exact upstream commits, download URLs and SHA-256 checksums are recorded in `sources.json`. Font files are unmodified and used only during the build; they are not copied to the public site.
4. The renderer creates its Fontconfig configuration and cache in the operating system temporary directory. It does not change system font settings, download fonts during a build, or use the user's private fonts.
