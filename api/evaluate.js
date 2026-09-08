import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { profileId, companyName, jobTitle, jobDescription, optionalInsights } = req.body;

  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', profileId).single();
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const systemPrompt = `You are an elite executive career strategist. Evaluate the Job Description against the candidate resume.
Return a structured JSON object containing:
- matchRate (number)
- keyFocus (string, e.g., B2B, B2C, Sales, Performance Marketing)
- expectedSalary (string)
- jobType (string, e.g., Hybrid 2 days, Full remote)
- strategicSummary (string)
- gapsToAddress (array of strings)
- interviewStrategy (array of strings)

CANDIDATE RESUME:
${profile.resume_text}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Company: ${companyName}\nTitle: ${jobTitle}\nJD:\n${jobDescription}\nInsights: ${optionalInsights}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });

    const resultData = await response.json();
    const evaluationJson = JSON.parse(resultData.choices[0].message.content);

    const { data: appRecord, error } = await supabase.from('applications').insert({
      profile_id: profileId,
      company_name: companyName,
      job_title: jobTitle,
      job_description: jobDescription,
      optional_insights: optionalInsights,
      current_stage: 'application_builder',
      stage_1_output: evaluationJson
    }).select().single();

    if (error) throw error;

    return res.status(200).json({ success: true, application: appRecord });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
