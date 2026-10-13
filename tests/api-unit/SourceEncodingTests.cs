namespace AngebotPilot.UnitTests;

/// <summary>
/// Guards against double-encoded UTF-8 (e.g. "FÃ¼r" instead of "Für") in user-facing German texts, which happens when a
/// tool reads UTF-8 without BOM as Windows-1252 and writes it back.
/// </summary>
public class SourceEncodingTests
{
    private static readonly string[] Mojibake = ["Ã¤", "Ã¶", "Ã¼", "ÃŸ", "Ã„", "Ã–", "Ãœ", "â€", "Â§"];

    [Fact]
    public void Backend_sources_contain_no_double_encoded_utf8()
    {
        var root = FindRepositoryRoot();
        var offenders = Directory.EnumerateFiles(Path.Combine(root, "apps", "api", "src"), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .SelectMany(f => File.ReadLines(f).Select((line, i) => (File: f, Line: i + 1, Text: line)))
            .Where(l => Mojibake.Any(m => l.Text.Contains(m, StringComparison.Ordinal)))
            .Select(l => $"{Path.GetRelativePath(root, l.File)}:{l.Line}")
            .ToList();
        Assert.True(offenders.Count == 0, "Double-encoded UTF-8 found in: " + string.Join(", ", offenders));
    }

    private static string FindRepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AngebotPilot.sln")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("Repository root not found.");
    }
}
